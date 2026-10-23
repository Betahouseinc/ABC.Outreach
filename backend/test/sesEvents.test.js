const test = require('node:test');
const assert = require('node:assert/strict');
const { handleSesEvent } = require('../lib/sesEvents');
const { fakeStore } = require('./helpers');

function setup(status = 'sent') {
  const store = fakeStore({ recipients: [{ id: 'r1', campaign_id: 'c1', email: 'jo@x.com', status }] });
  store.events.push({ org_id: 'org1', campaign_id: 'c1', recipient_id: 'r1', message_id: 'M1', email: 'jo@x.com', type: 'send' });
  return store;
}
const mail = { messageId: 'M1', destination: ['jo@x.com'] };

test('permanent bounce suppresses the address and marks the recipient bounced', async () => {
  const store = setup();
  await handleSesEvent(store, { eventType: 'Bounce', mail, bounce: { bounceType: 'Permanent', bounceSubType: 'General', bouncedRecipients: [{ emailAddress: 'Jo@X.com' }] } });
  assert.equal(store.recipients[0].status, 'bounced');
  assert.deepEqual(store.suppressions.map(s => [s.email, s.reason]), [['jo@x.com', 'bounce']]);
  assert.ok(store.events.some(e => e.type === 'bounce'));
});

test('transient bounce is recorded but not suppressed', async () => {
  const store = setup();
  await handleSesEvent(store, { eventType: 'Bounce', mail, bounce: { bounceType: 'Transient', bounceSubType: 'MailboxFull', bouncedRecipients: [{ emailAddress: 'jo@x.com' }] } });
  assert.equal(store.suppressions.length, 0);
  assert.equal(store.recipients[0].status, 'sent');
  assert.match(store.recipients[0].error_msg, /MailboxFull/);
});

test('complaint suppresses and marks the recipient complained', async () => {
  const store = setup();
  await handleSesEvent(store, { eventType: 'Complaint', mail, complaint: { complaintFeedbackType: 'abuse', complainedRecipients: [{ emailAddress: 'jo@x.com' }] } });
  assert.equal(store.recipients[0].status, 'complained');
  assert.equal(store.suppressions[0].reason, 'complaint');
});

test('delivery moves sent → delivered but never overwrites a bounce', async () => {
  const store = setup();
  await handleSesEvent(store, { eventType: 'Delivery', mail, delivery: { smtpResponse: '250 OK' } });
  assert.equal(store.recipients[0].status, 'delivered');
  const bounced = setup('bounced');
  await handleSesEvent(bounced, { eventType: 'Delivery', mail, delivery: {} });
  assert.equal(bounced.recipients[0].status, 'bounced');
});

test('reject and rendering failure mark the recipient failed', async () => {
  const store = setup();
  await handleSesEvent(store, { eventType: 'Rendering Failure', mail, failure: { errorMessage: 'bad template' } });
  assert.equal(store.recipients[0].status, 'failed');
  assert.match(store.recipients[0].error_msg, /bad template/);
});

test("a customer's topic cannot touch another company's messages", async () => {
  const store = setup();
  const out = await handleSesEvent(store,
    { eventType: 'Complaint', mail, complaint: { complainedRecipients: [{ emailAddress: 'jo@x.com' }] } },
    { orgIds: ['attacker-org'] });
  assert.match(out.ignored, /another company/);
  assert.equal(store.suppressions.length, 0);
  assert.equal(store.recipients[0].status, 'sent');
});

test("a customer's topic does update its own company's messages", async () => {
  const store = setup();
  await handleSesEvent(store, { eventType: 'Complaint', mail, complaint: { complainedRecipients: [{ emailAddress: 'jo@x.com' }] } }, { orgIds: ['org1'] });
  assert.equal(store.recipients[0].status, 'complained');
});

test('events for unknown message ids are ignored; test-send bounces still suppress', async () => {
  const store = setup();
  const out = await handleSesEvent(store, { eventType: 'Bounce', mail: { messageId: 'nope' }, bounce: { bounceType: 'Permanent', bouncedRecipients: [{ emailAddress: 'x@y.com' }] } });
  assert.match(out.ignored, /unknown message/);
  store.events.push({ org_id: 'org1', campaign_id: 'c1', recipient_id: null, message_id: 'T1', email: 'bounce@simulator.amazonses.com', type: 'send' });
  await handleSesEvent(store, { eventType: 'Bounce', mail: { messageId: 'T1' }, bounce: { bounceType: 'Permanent', bounceSubType: 'General', bouncedRecipients: [{ emailAddress: 'bounce@simulator.amazonses.com' }] } });
  assert.ok(store.suppressions.some(s => s.email === 'bounce@simulator.amazonses.com'));
});
