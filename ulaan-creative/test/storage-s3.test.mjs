// Integration test of the S3 driver against s3rver (local S3 emulator).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import S3rver from 's3rver';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 's3rver-'));
let server;
before(async () => {
  server = new S3rver({ port: 4569, address: '127.0.0.1', silent: true, directory: dir, configureBuckets: [{ name: 'ulaan-test' }] });
  await server.run();
  Object.assign(process.env, {
    STORAGE_DRIVER: 's3', S3_ENDPOINT: 'http://127.0.0.1:4569', S3_REGION: 'us-east-1', S3_BUCKET: 'ulaan-test',
    S3_ACCESS_KEY_ID: 'S3RVER', S3_SECRET_ACCESS_KEY: 'S3RVER', S3_FORCE_PATH_STYLE: 'true', MEDIA_PUBLIC_BASE_URL: 'http://127.0.0.1:4569/ulaan-test',
  });
});
after(async () => { await server.close(); fs.rmSync(dir, { recursive: true, force: true }); });

test('presigned PUT → HEAD → range read → public URL → delete', async () => {
  const s = await import('../lib/storage.js');
  const { sniff } = await import('../lib/media-rules.js');
  assert.equal(s.storageDriver(), 's3');
  const key = 'media/2026/10/test-object.png';
  const png = Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), Buffer.alloc(5000, 7)]);
  const url = await s.presignPut(key);
  assert.match(url, /X-Amz-Signature=/);
  const put = await fetch(url, { method: 'PUT', body: png, headers: { 'Content-Type': 'image/png' } });
  assert.equal(put.status, 200, await put.text());
  const head = await s.headObject(key);
  assert.equal(head.size, png.length);
  assert.equal(sniff(await s.readHead(key, 64)), 'image/png');
  const pub = await fetch(s.publicUrl(key));
  assert.equal(pub.status, 200);
  await s.deleteObject(key);
  assert.equal(await s.headObject(key), null);
});

test('query signing matches the official AWS SigV4 presigned-URL test vector', async () => {
  // https://docs.aws.amazon.com/AmazonS3/latest/API/sigv4-query-string-auth.html (example)
  const { AwsClient } = await import('aws4fetch');
  const c = new AwsClient({ accessKeyId: 'AKIAIOSFODNN7EXAMPLE', secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY', service: 's3', region: 'us-east-1' });
  const signed = await c.sign('https://examplebucket.s3.amazonaws.com/test.txt?X-Amz-Expires=86400', { aws: { signQuery: true, datetime: '20130524T000000Z' } });
  assert.equal(new URL(signed.url).searchParams.get('X-Amz-Signature'), 'aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404');
});
