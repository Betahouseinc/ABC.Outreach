const test = require('node:test');
const assert = require('node:assert/strict');
const { createSender, domainAllowed } = require('../lib/sender');
const { fakeStore, fakeMailer, baseConfig } = require('./helpers');

const campaign = { id: 'c1', status: 'draft', subject: 'Hi {{first_name}}', from_name: 'Acme', from_email: 'news@example.com', html_body: '<body>Hello {{name}}</body>' };

function recipients(n) {
  return Array.from({ length: n }, (_, i) => ({ id: `r${String(i).padStart(4, '0')}`, campaign_id: 'c1', email: `user${i}@test.com`, name: `User ${i}` }));
}

function setup({ n = 3, config = {}, mailer, ...storeOpts } = {}) {
  const store = fakeStore({ recipients: recipients(n), ...storeOpts });
  store.campaigns.c1 = { ...campaign };
  const m = mailer || fakeMailer();
  const sleeps = [];
  const sender = createSender({ store, mailer: m, config: { ...baseConfig, ...config }, sleep: async ms => { sleeps.push(ms); }, log: { error() {} } });
  return { store, mailer: m, sender, sleeps };
}

test('sends to every pending recipient across several batches (old offset bug skipped half)', async () => {
  const { store, mailer, sender } = setup({ n: 120 });
  const out = await sender.startCampaign('org1', store.campaigns.c1);
  assert.equal(out.status, 200);
  await out.done;
  assert.equal(mailer.sent.length, 120);
  assert.equal(new Set(mailer.sent.map(m => m.to)).size, 120);
  assert.equal(store.campaigns.c1.status, 'sent');
  assert.equal(store.campaigns.c1.sent_count, 120);
  assert.equal(store.events.filter(e => e.type === 'send').length, 120);
});

test('suppressed addresses are skipped and marked suppressed', async () => {
  const { store, mailer, sender } = setup({ suppressed: ['user1@test.com'] });
  await (await sender.startCampaign('org1', store.campaigns.c1)).done;
  assert.deepEqual(mailer.sent.map(m => m.to), ['user0@test.com', 'user2@test.com']);
  assert.equal(store.recipients[1].status, 'suppressed');
});

test('each message carries List-Unsubscribe data, merge tags and the footer', async () => {
  const { store, mailer, sender } = setup({ n: 1 });
  await (await sender.startCampaign('org1', store.campaigns.c1)).done;
  const msg = mailer.sent[0];
  assert.equal(msg.subject, 'Hi User');
  assert.match(msg.unsubscribeUrl, /^https:\/\/api\.test\/u\//);
  assert.match(msg.html, /Hello User 0/);
  assert.match(msg.html, /1 Main St, Sydney/);
  assert.match(msg.text, /Hello User 0/);
});

test('sending is paced to SEND_RATE_PER_SEC', async () => {
  const { store, sender, sleeps } = setup({ n: 4, config: { sendRatePerSec: 2 } });
  await (await sender.startCampaign('org1', store.campaigns.c1)).done;
  assert.equal(sleeps.length, 4);
  assert.ok(sleeps.every(ms => ms > 0 && ms <= 500));
});

test('a rejected address fails alone; the campaign carries on', async () => {
  const err = Object.assign(new Error('Email address is not verified'), { name: 'MessageRejected' });
  const { store, mailer, sender } = setup({ mailer: fakeMailer({ failFor: { 'user1@test.com': err } }) });
  await (await sender.startCampaign('org1', store.campaigns.c1)).done;
  assert.equal(mailer.sent.length, 2);
  assert.equal(store.recipients[1].status, 'failed');
  assert.equal(store.campaigns.c1.status, 'sent');
  assert.equal(store.campaigns.c1.failed_count, 1);
});

test('throttling is retried with backoff', async () => {
  let calls = 0;
  const throttle = () => (++calls <= 2 ? Object.assign(new Error('Maximum sending rate exceeded.'), { name: 'TooManyRequestsException' }) : null);
  const { store, mailer, sender } = setup({ n: 1, mailer: fakeMailer({ failFor: { 'user0@test.com': throttle } }) });
  await (await sender.startCampaign('org1', store.campaigns.c1)).done;
  assert.equal(mailer.sent.length, 1);
  assert.equal(store.recipients[0].status, 'sent');
});

test('a quota error pauses the campaign; resume sends only the rest', async () => {
  let blocked = true;
  const quota = () => (blocked ? Object.assign(new Error('Daily message quota exceeded.'), { name: 'LimitExceededException' }) : null);
  const { store, mailer, sender } = setup({ mailer: fakeMailer({ failFor: { 'user1@test.com': quota } }) });
  await (await sender.startCampaign('org1', store.campaigns.c1)).done;
  assert.equal(store.campaigns.c1.status, 'paused');
  assert.match(store.campaigns.c1.last_error, /quota/);
  assert.equal(store.recipients[1].status, 'pending');
  blocked = false;
  await (await sender.startCampaign('org1', store.campaigns.c1)).done;
  assert.deepEqual(mailer.sent.map(m => m.to), ['user0@test.com', 'user1@test.com', 'user2@test.com']);
  assert.equal(store.campaigns.c1.status, 'sent');
});

test('real send is refused in dry-run mode, without a verified domain, address or with unknown tags', async () => {
  assert.equal((await setup({ config: { dryRun: true } }).sender.startCampaign('org1', campaign)).status, 400);

  const noDomain = setup({ domains: [] });
  const r1 = await noDomain.sender.startCampaign('org1', noDomain.store.campaigns.c1);
  assert.match(r1.error, /not a verified sending domain/);

  const noAddr = setup({ org: { id: 'org1', name: 'Acme', business_address: '' } });
  assert.match((await noAddr.sender.startCampaign('org1', noAddr.store.campaigns.c1)).error, /business postal address/);

  const tags = setup();
  tags.store.campaigns.c1.html_body = '<body>{{promo_code}}</body>';
  assert.match((await tags.sender.startCampaign('org1', tags.store.campaigns.c1)).error, /\{\{promo_code\}\}/);
  assert.equal(tags.mailer.sent.length, 0);
});

test('a second click while sending cannot start a second sender', async () => {
  let release;
  const gate = new Promise(r => { release = r; });
  const slow = fakeMailer();
  const send = slow.send;
  slow.send = async msg => { await gate; return send(msg); };
  const { store, sender } = setup({ n: 2, mailer: slow });
  const first = await sender.startCampaign('org1', store.campaigns.c1);
  const second = await sender.startCampaign('org1', { ...campaign, status: 'draft' });
  assert.equal(second.status, 409);
  release();
  await first.done;
  assert.equal(slow.sent.length, 2);
});

test('Test run reports counts and a preview without sending or changing anything', async () => {
  const { store, mailer, sender } = setup({ n: 3, suppressed: ['user2@test.com'], config: { dryRun: true } });
  const r = await sender.testRun('org1', store.campaigns.c1);
  assert.equal(r.ok, true);
  assert.deepEqual(r.recipients, { pending: 3, suppressed: 1, willSend: 2 });
  assert.equal(r.preview.subject, 'Hi User');
  assert.ok(r.warnings.some(w => /DRY_RUN/.test(w)));
  assert.equal(mailer.sent.length, 0);
  assert.ok(store.recipients.every(x => x.status === 'pending'));
});

test('Send test prefixes [TEST], has no tracking, and logs a send event for bounce lookups', async () => {
  const { store, mailer, sender } = setup({ n: 1 });
  const out = await sender.sendTest('org1', store.campaigns.c1, ['me@test.com']);
  assert.equal(out.results[0].status, 'sent');
  assert.equal(mailer.sent[0].subject, '[TEST] Hi User');
  assert.ok(!mailer.sent[0].html.includes('/track/'));
  assert.ok(store.events.some(e => e.type === 'send' && e.email === 'me@test.com' && e.recipient_id === null));
});

test('subdomains of a verified domain are allowed', () => {
  assert.ok(domainAllowed('news.example.com', new Set(['example.com'])));
  assert.ok(!domainAllowed('badexample.com', new Set(['example.com'])));
});
