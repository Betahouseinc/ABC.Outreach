const test = require('node:test');
const assert = require('node:assert/strict');
const { signSignup, verifySignup } = require('../lib/tokens');
const { createSender } = require('../lib/sender');
const { fakeStore, fakeMailer, baseConfig } = require('./helpers');

const SECRET = 'test-secret';

test('sign-up token round-trips email and company', () => {
  const t = signSignup(SECRET, { email: 'Sachin@Example.com', company: 'Kamte & Co', exp: Date.now() + 60_000 });
  assert.deepEqual(verifySignup(SECRET, t), { email: 'sachin@example.com', company: 'Kamte & Co' });
});

test('sign-up token is rejected when expired, tampered or signed with another secret', () => {
  const expired = signSignup(SECRET, { email: 'a@b.co', company: 'X', exp: Date.now() - 1 });
  assert.equal(verifySignup(SECRET, expired), null);

  const good = signSignup(SECRET, { email: 'a@b.co', company: 'X', exp: Date.now() + 60_000 });
  const [, sig] = good.split('.');
  const forged = Buffer.from(JSON.stringify({ e: 'victim@b.co', n: 'X', x: Date.now() + 60_000 })).toString('base64url');
  assert.equal(verifySignup(SECRET, `${forged}.${sig}`), null);
  assert.equal(verifySignup('other-secret', good), null);
  assert.equal(verifySignup(SECRET, 'garbage'), null);
});

test('a sign-up token is not accepted as an unsubscribe token or vice versa', () => {
  const { verifyUnsubscribe } = require('../lib/tokens');
  const t = signSignup(SECRET, { email: 'a@b.co', company: 'X', exp: Date.now() + 60_000 });
  assert.equal(verifyUnsubscribe(SECRET, t), null);
});

function sender(status) {
  const store = fakeStore({ recipients: [{ id: 'r1', campaign_id: 'c1', email: 'u@test.com', name: 'U' }] });
  store.campaigns.c1 = { id: 'c1', status: 'draft', subject: 'Hi', from_name: 'A', from_email: 'news@example.com', html_body: '<p>Hi</p>' };
  const mailer = fakeMailer();
  const accounts = { async sendingStatus() { return status; } };
  return { store, mailer, s: createSender({ store, mailer, config: baseConfig, accounts, sleep: async () => {}, log: { error() {} } }) };
}

test('a company without a connected SES account cannot send', async () => {
  const { store, mailer, s } = sender({ error: 'Connect your own Amazon SES account in Settings before sending.' });
  const pf = await s.preflight('org1', store.campaigns.c1);
  assert.ok(pf.errors.some(e => /Connect your own Amazon SES/.test(e)));
  const out = await s.startCampaign('org1', store.campaigns.c1);
  assert.equal(out.status, 400);
  assert.equal(mailer.sent.length, 0);
});

test('house companies are not blocked', async () => {
  const { store, s } = sender({ house: true });
  const pf = await s.preflight('org1', store.campaigns.c1);
  assert.deepEqual(pf.errors, []);
  assert.equal(pf.rate, baseConfig.sendRatePerSec);
});

test("a connected company sends at no more than its SES rate, with its orgId, and sandbox is a warning", async () => {
  const { store, mailer, s } = sender({ maxSendRate: 2, sandbox: true });
  const pf = await s.preflight('org1', store.campaigns.c1);
  assert.equal(pf.rate, 2);
  assert.ok(pf.warnings.some(w => /sandbox/.test(w)));
  await (await s.startCampaign('org1', store.campaigns.c1)).done;
  assert.equal(mailer.sent[0].orgId, 'org1');
});
