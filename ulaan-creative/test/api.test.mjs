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
  const endpoints = [['GET', '/overview'], ['GET', '/projects'], ['POST', '/projects'], ['GET', '/media'], ['POST', '/media/uploads'], ['GET', '/submissions'], ['PUT', '/content/hero'], ['GET', '/influencers'], ['GET', '/influencer-categories'], ['POST', '/influencer-categories'],
    ['PUT', '/influencer-categories/00000000-0000-0000-0000-000000000000'], ['DELETE', '/influencer-categories/00000000-0000-0000-0000-000000000000'],
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

test('videos: only H.264 + AAC MP4 is accepted (plays on Android, iPhone, desktop)', async () => {
  const cookie = await login();
  const A = { ...H, Cookie: cookie };
  const { readFileSync } = await import('node:fs');
  const upload = async (file, name) => {
    const buf = readFileSync(new URL(`./fixtures/${file}`, import.meta.url));
    const init = await fetch(`${BASE}/api/admin/media/uploads`, { method: 'POST', headers: A, body: JSON.stringify({ name, size: buf.length, type: 'video/mp4' }) });
    if (init.status !== 201) return { status: init.status };
    const { id, uploadUrl } = await init.json();
    const put = await fetch(new URL(uploadUrl, BASE), { method: 'PUT', headers: { 'Content-Type': 'video/mp4' }, body: buf });
    assert.ok(put.ok, 'PUT to storage');
    const done = await fetch(`${BASE}/api/admin/media/${id}/complete`, { method: 'POST', headers: A, body: '{}' });
    return { status: done.status, body: await done.json() };
  };
  assert.equal((await fetch(`${BASE}/api/admin/media/uploads`, { method: 'POST', headers: A, body: JSON.stringify({ name: 'clip.mov', size: 1000, type: 'video/quicktime' }) })).status, 400, 'MOV must be converted first');
  assert.equal((await fetch(`${BASE}/api/admin/media/uploads`, { method: 'POST', headers: A, body: JSON.stringify({ name: 'clip.webm', size: 1000, type: 'video/webm' }) })).status, 400, 'WebM must be converted first');
  const hevc = await upload('hevc-aac.mp4', `hevc-${Date.now()}.mp4`);
  assert.equal(hevc.status, 400, 'HEVC MP4 rejected');
  assert.match(hevc.body.message || '', /HEVC/);
  const ok = await upload('h264-aac.mp4', `h264-${Date.now()}.mp4`);
  assert.equal(ok.status, 200, 'H.264 + AAC MP4 accepted');
  await fetch(`${BASE}/api/admin/media/${ok.body.item.id}`, { method: 'DELETE', headers: A });
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

test('influencer price is admin-only', async () => {
  const cookie = await login();
  const price = 'PRICE-' + Date.now();
  const create = await fetch(`${BASE}/api/admin/influencers`, { method: 'POST', headers: { ...H, Cookie: cookie }, body: JSON.stringify({ name: 'Price Test Creator', price, instagram: 'https://instagram.com/test', status: 'published' }) });
  assert.equal(create.status, 200);
  const { item } = await create.json();
  assert.equal(item.price, price, 'admin sees the price');
  const pub = await (await fetch(`${BASE}/api/public/content`)).json();
  assert.ok(JSON.stringify(pub).includes('Price Test Creator'), 'published influencer is public');
  assert.ok(!JSON.stringify(pub).includes(price), 'price not in public API');
  assert.ok(!(await (await fetch(`${BASE}/`)).text()).includes(price), 'price not in public HTML');
  await fetch(`${BASE}/api/admin/influencers/${item.id}`, { method: 'DELETE', headers: { ...H, Cookie: cookie } });
});

test('influencer categories: many-to-many, deleting a category keeps the profile', async () => {
  const cookie = await login();
  const A = { ...H, Cookie: cookie };
  const mk = async (name) => (await (await fetch(`${BASE}/api/admin/influencer-categories`, { method: 'POST', headers: A, body: JSON.stringify({ name }) })).json()).item;
  const c1 = await mk('Test Cat ' + Date.now()), c2 = await mk('Test Cat2 ' + Date.now());
  assert.equal((await fetch(`${BASE}/api/admin/influencer-categories`, { method: 'POST', headers: A, body: JSON.stringify({ name: c1.name }) })).status, 409, 'duplicate name rejected');
  const inf = (await (await fetch(`${BASE}/api/admin/influencers`, { method: 'POST', headers: A, body: JSON.stringify({ name: 'Category Test Creator', categoryIds: [c1.id, c2.id], status: 'published' }) })).json()).item;
  assert.deepEqual(inf.categoryIds.sort(), [c1.id, c2.id].sort());
  const renamed = await fetch(`${BASE}/api/admin/influencer-categories/${c1.id}`, { method: 'PUT', headers: A, body: JSON.stringify({ name: c1.name + ' renamed' }) });
  assert.equal(renamed.status, 200);
  assert.equal((await fetch(`${BASE}/api/admin/influencer-categories/${c1.id}`, { method: 'DELETE', headers: A })).status, 200);
  const after = (await (await fetch(`${BASE}/api/admin/influencers/${inf.id}`, { headers: A })).json()).item;
  assert.equal(after.name, 'Category Test Creator', 'profile survives category deletion');
  assert.deepEqual(after.categoryIds, [c2.id]);
  await fetch(`${BASE}/api/admin/influencers/${inf.id}`, { method: 'DELETE', headers: A });
  await fetch(`${BASE}/api/admin/influencer-categories/${c2.id}`, { method: 'DELETE', headers: A });
});

test('campaign inquiry stores the selected (published) influencers', async () => {
  const cookie = await login();
  const A = { ...H, Cookie: cookie };
  const pub = (await (await fetch(`${BASE}/api/admin/influencers`, { method: 'POST', headers: A, body: JSON.stringify({ name: 'Inquiry Test Creator', status: 'published' }) })).json()).item;
  const draft = (await (await fetch(`${BASE}/api/admin/influencers`, { method: 'POST', headers: A, body: JSON.stringify({ name: 'Inquiry Draft Creator', status: 'draft' }) })).json()).item;
  const post = (b, ip) => fetch(`${BASE}/api/contact`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ip }, body: JSON.stringify(b) });
  const base = { name: 'Inquiry Test', contact: 'inq@example.com', service: 'influencer', kind: 'influencer', message: 'Campaign objective text', consent: 'yes', ts: Date.now() - 10000 };
  assert.equal((await post({ ...base, influencers: [draft.id] }, '10.7.0.1')).status, 400, 'draft influencer is not selectable');
  assert.equal((await post({ ...base, influencers: [pub.id], campaignStart: '2026-12-10', campaignEnd: '2026-12-01' }, '10.7.0.2')).status, 400, 'end before start');
  const ok = await post({ ...base, influencers: [pub.id, draft.id], campaignStart: '2026-12-01', campaignEnd: '2026-12-20', notes: 'note' }, '10.7.0.3');
  assert.equal(ok.status, 200);
  const subs = (await (await fetch(`${BASE}/api/admin/submissions`, { headers: A })).json()).items;
  const mine = subs.find((x) => x.contact === 'inq@example.com' && x.kind === 'influencer');
  assert.ok(mine, 'submission stored');
  assert.deepEqual(mine.influencers.map((i) => i.name), ['Inquiry Test Creator'], 'only published influencer kept');
  assert.equal(mine.campaign_dates, '2026-12-01 → 2026-12-20');
  await fetch(`${BASE}/api/admin/submissions/${mine.id}`, { method: 'DELETE', headers: A });
  for (const x of [pub, draft]) await fetch(`${BASE}/api/admin/influencers/${x.id}`, { method: 'DELETE', headers: A });
});

test('first-admin web setup is closed once an admin exists (or without ADMIN_SETUP_TOKEN)', async () => {
  const st = await (await fetch(`${BASE}/api/admin/setup`)).json();
  assert.equal(st.needed, false);
  const r = await fetch(`${BASE}/api/admin/setup`, { method: 'POST', headers: H, body: JSON.stringify({ token: 'x'.repeat(20), email: 'intruder@example.com', password: 'Intruder-pass-2026' }) });
  assert.ok([403, 410].includes(r.status), `got ${r.status}`);
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
