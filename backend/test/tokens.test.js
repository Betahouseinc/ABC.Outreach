const test = require('node:test');
const assert = require('node:assert/strict');
const { signUnsubscribe, verifyUnsubscribe, signClick, verifyClick } = require('../lib/tokens');

test('unsubscribe token round-trips and lowercases the email', () => {
  const t = signUnsubscribe('k', { orgId: 'o', email: 'A@B.com', campaignId: 'c', recipientId: 'r' });
  assert.deepEqual(verifyUnsubscribe('k', t), { orgId: 'o', email: 'a@b.com', campaignId: 'c', recipientId: 'r' });
});

test('tampered or wrongly-signed unsubscribe tokens are rejected', () => {
  const t = signUnsubscribe('k', { orgId: 'o', email: 'a@b.com' });
  const [body, sig] = t.split('.');
  const forged = Buffer.from(JSON.stringify({ o: 'other-org', e: 'a@b.com' })).toString('base64url');
  assert.equal(verifyUnsubscribe('k', `${forged}.${sig}`), null);
  assert.equal(verifyUnsubscribe('other-key', t), null);
  assert.equal(verifyUnsubscribe('k', body), null);
  assert.equal(verifyUnsubscribe('k', undefined), null);
});

test('click signatures bind campaign, recipient and URL', () => {
  const sig = signClick('k', 'c1', 'r1', 'https://a.com');
  assert.ok(verifyClick('k', 'c1', 'r1', 'https://a.com', sig));
  assert.ok(!verifyClick('k', 'c1', 'r1', 'https://evil.com', sig));
  assert.ok(!verifyClick('k', 'c1', 'r2', 'https://a.com', sig));
  assert.ok(!verifyClick('k', 'c1', 'r1', 'https://a.com', undefined));
});
