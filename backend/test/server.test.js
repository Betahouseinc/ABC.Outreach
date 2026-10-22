// Boots the real Express app (dummy Supabase URL, nothing reaches a database) and checks the public routes.
const test = require('node:test');
const assert = require('node:assert/strict');

process.env.SUPABASE_URL = 'http://127.0.0.1:9';
process.env.SUPABASE_SERVICE_KEY = 'dummy';
process.env.SNS_TOPIC_ARN = 'arn:aws:sns:ap-southeast-2:111111111111:exomail-ses-events';
process.env.FRONTEND_URL = 'https://app.test';

const app = require('../server');
const config = require('../config');
const { signUnsubscribe } = require('../lib/tokens');

let server, base;
test.before(() => new Promise(r => { server = app.listen(0, () => { base = `http://127.0.0.1:${server.address().port}`; r(); }); }));
test.after(() => server.close());

test('GET /health', async () => {
  const r = await fetch(`${base}/health`);
  assert.equal(r.status, 200);
  assert.equal((await r.json()).ok, true);
});

test('unsubscribe page: valid token shows a confirm form, forged token is rejected', async () => {
  const token = signUnsubscribe(config.appSecret, { orgId: 'o1', email: 'jo@x.com' });
  const ok = await fetch(`${base}/u/${token}`);
  assert.equal(ok.status, 200);
  assert.match(await ok.text(), /jo@x\.com[\s\S]*<form method="post">/);
  assert.equal((await fetch(`${base}/u/${token}x`)).status, 400);
});

test('SES webhook rejects other topics and unsigned messages', async () => {
  const post = body => fetch(`${base}/webhooks/ses`, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(body) });
  assert.equal((await post({ Type: 'Notification', TopicArn: 'arn:aws:sns:us-east-1:2:other' })).status, 403);
  assert.equal((await post({ Type: 'Notification', TopicArn: process.env.SNS_TOPIC_ARN, Message: '{}' })).status, 403);
});

test('click tracking refuses unsigned redirects', async () => {
  const r = await fetch(`${base}/track/click/c1/r1?url=${encodeURIComponent('https://evil.com')}`, { redirect: 'manual' });
  assert.equal(r.status, 400);
});

test('API: CORS only for FRONTEND_URL, and auth required', async () => {
  const good = await fetch(`${base}/api/campaigns`, { headers: { Origin: 'https://app.test' } });
  assert.equal(good.status, 401);
  assert.equal(good.headers.get('access-control-allow-origin'), 'https://app.test');
  const bad = await fetch(`${base}/api/campaigns`, { headers: { Origin: 'https://evil.com' } });
  assert.equal(bad.headers.get('access-control-allow-origin'), null);
});
