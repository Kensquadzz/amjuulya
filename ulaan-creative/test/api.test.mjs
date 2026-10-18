// Security / API tests against a running server (npm run dev) with a database.
// Usage: TEST_BASE=http://localhost:3000 TEST_EMAIL=… TEST_PASSWORD=… node --test test/api.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';

const BASE = process.env.TEST_BASE || 'http://localhost:3000';
const EMAIL = process.env.TEST_EMAIL;
const PASSWORD = process.env.TEST_PASSWORD;
const H = { 'Content-Type': 'application/json', 'X-UC-Admin': '1' };

async function login() {
  const r = await fetch(`${BASE}/api/admin/auth/login`, { method: 'POST', headers: H, body: JSON.stringify({ email: EMAIL, password: PASSWORD }) });
  assert.equal(r.status, 200, 'login should succeed');
  return r.headers.get('set-cookie').split(';')[0];
}

test('every admin endpoint requires a session', async () => {
  const endpoints = [['GET', '/overview'], ['GET', '/projects'], ['POST', '/projects'], ['GET', '/media'], ['POST', '/media/uploads'], ['GET', '/submissions'], ['PUT', '/content/hero'], ['GET', '/influencers'],
    ['DELETE', '/projects/00000000-0000-0000-0000-000000000000'], ['DELETE', '/media/00000000-0000-0000-0000-000000000000']];
  for (const [method, p] of endpoints) {
    const r = await fetch(`${BASE}/api/admin${p}`, { method, headers: H, body: method === 'GET' || method === 'DELETE' ? undefined : '{}' });
    assert.equal(r.status, 401, `${method} ${p}`);
  }
  const forged = await fetch(`${BASE}/api/admin/overview`, { headers: { ...H, Cookie: 'uc_admin=forged-token' } });
  assert.equal(forged.status, 401);
});

test('admin preview pages require a session', async () => {
  const r = await fetch(`${BASE}/admin/preview/site`, { redirect: 'manual' });
  assert.equal(r.status, 302);
});

test('state-changing requests need the CSRF header and same origin', async () => {
  const cookie = await login();
  const noHeader = await fetch(`${BASE}/api/admin/projects`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: '{"title":"x"}' });
  assert.equal(noHeader.status, 403);
  const evil = await fetch(`${BASE}/api/admin/projects`, { method: 'POST', headers: { ...H, Cookie: cookie, Origin: 'https://evil.example' }, body: '{"title":"x"}' });
  assert.equal(evil.status, 403);
});

test('upload validation: extension, size, SVG', async () => {
  const cookie = await login();
  const up = (b) => fetch(`${BASE}/api/admin/media/uploads`, { method: 'POST', headers: { ...H, Cookie: cookie }, body: JSON.stringify(b) });
  assert.equal((await up({ name: 'x.exe', size: 100, type: 'application/octet-stream' })).status, 400);
  assert.equal((await up({ name: 'x.svg', size: 100, type: 'image/svg+xml' })).status, 400);
  assert.equal((await up({ name: 'big.jpg', size: 999 * 1024 * 1024, type: 'image/jpeg' })).status, 400);
  assert.equal((await up({ name: 'huge.mp4', size: 50 * 1024 * 1024 * 1024, type: 'video/mp4' })).status, 400);
  assert.equal((await up({ name: 'x.jpg', size: 100, type: 'video/mp4' })).status, 400, 'extension / MIME mismatch');
});

test('input validation on content & projects', async () => {
  const cookie = await login();
  const bad = await fetch(`${BASE}/api/admin/projects`, { method: 'POST', headers: { ...H, Cookie: cookie }, body: JSON.stringify({ title: '' }) });
  assert.equal(bad.status, 400);
  const badUrl = await fetch(`${BASE}/api/admin/projects`, { method: 'POST', headers: { ...H, Cookie: cookie }, body: JSON.stringify({ title: 'x', externalUrl: 'javascript:alert(1)' }) });
  assert.equal(badUrl.status, 400);
  const unknownKey = await fetch(`${BASE}/api/admin/content/not_a_key`, { method: 'PUT', headers: { ...H, Cookie: cookie }, body: '{"value":{}}' });
  assert.equal(unknownKey.status, 404);
  // HTML in content is stored as text and escaped on render
  const r = await fetch(`${BASE}/api/admin/content/footer`, { method: 'PUT', headers: { ...H, Cookie: cookie }, body: JSON.stringify({ value: { tagline: '<script>alert(1)</script>', extra: 'dropped' } }) });
  const saved = await r.json();
  assert.deepEqual(Object.keys(saved.value), ['tagline']);
  const prev = await (await fetch(`${BASE}/admin/preview/site`, { headers: { Cookie: cookie } })).text();
  assert.ok(prev.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  assert.ok(!prev.includes('<script>alert(1)</script>'));
  await fetch(`${BASE}/api/admin/content/footer/discard`, { method: 'POST', headers: { ...H, Cookie: cookie } });
});

test('drafts never appear in public endpoints', async () => {
  const cookie = await login();
  const create = await fetch(`${BASE}/api/admin/projects`, { method: 'POST', headers: { ...H, Cookie: cookie }, body: JSON.stringify({ title: 'Secret draft project', status: 'draft' }) });
  const { item } = await create.json();
  const pub = await (await fetch(`${BASE}/api/public/content`)).json();
  assert.ok(!JSON.stringify(pub).includes('Secret draft project'));
  assert.equal((await fetch(`${BASE}/work/${item.slug}`)).status, 404);
  assert.ok(!(await (await fetch(`${BASE}/sitemap.xml`)).text()).includes(item.slug));
  await fetch(`${BASE}/api/admin/projects/${item.id}`, { method: 'DELETE', headers: { ...H, Cookie: cookie } });
});

test('security headers on public and admin pages', async () => {
  const home = await fetch(`${BASE}/`);
  assert.match(home.headers.get('content-security-policy'), /script-src 'self' 'nonce-/);
  assert.equal(home.headers.get('x-content-type-options'), 'nosniff');
  const admin = await fetch(`${BASE}/admin/login`);
  assert.equal(admin.headers.get('x-frame-options'), 'DENY');
  assert.match(admin.headers.get('x-robots-tag'), /noindex/);
});

test('contact form: validation, honeypot, rate limit', async () => {
  const post = (b, ip) => fetch(`${BASE}/api/contact`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ip }, body: JSON.stringify(b) });
  const ok = { name: 'API Test', contact: '99112233', service: 'ai', message: 'Testing the contact endpoint', consent: 'yes', ts: Date.now() - 10000 };
  assert.equal((await post({ ...ok, consent: '' }, '10.9.0.1')).status, 400, 'consent required');
  assert.equal((await post({ ...ok, service: 'hacker' }, '10.9.0.2')).status, 400, 'unknown service');
  assert.equal((await post({ ...ok, ts: Date.now() }, '10.9.0.3')).status, 429, 'too fast');
  const hp = await post({ ...ok, website: 'spam' }, '10.9.0.4');
  assert.equal(hp.status, 200);
  let last;
  for (let i = 0; i < 6; i++) last = await post(ok, '10.9.0.5');
  assert.equal(last.status, 429, 'rate limited after 5 per 10 min');
});

test('login is rate limited per account', async () => {
  const email = `nobody-${Date.now()}@test.local`;
  let r;
  for (let i = 0; i < 6; i++) r = await fetch(`${BASE}/api/admin/auth/login`, { method: 'POST', headers: { ...H, 'X-Forwarded-For': `10.8.0.${i}` }, body: JSON.stringify({ email, password: 'wrong-password-1' }) });
  assert.equal(r.status, 429);
});
