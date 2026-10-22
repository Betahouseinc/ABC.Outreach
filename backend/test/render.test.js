const test = require('node:test');
const assert = require('node:assert/strict');
const { renderEmail, missingTags, normalizeKey, htmlToText, injectTracking } = require('../lib/render');
const { verifyUnsubscribe, verifyClick } = require('../lib/tokens');

const org = { id: 'org1', name: 'Acme' };
const opts = { org, businessAddress: '1 Main St, Sydney', baseUrl: 'https://api.test', secret: 's3cret' };

test('merge tags are filled from built-ins and CSV fields, values HTML-escaped', () => {
  const campaign = { id: 'c1', subject: 'Hi {{ first_name }} from {{company}} via {{company_name}}', html_body: '<html><body><p>{{name}} / {{Company}} / {{email}}</p></body></html>' };
  const recipient = { id: 'r1', email: 'jo@x.com', name: 'Jo <b>Smith</b>', fields: { company: 'Big & Co' } };
  const out = renderEmail({ campaign, recipient, ...opts });
  assert.equal(out.subject, 'Hi Jo from Big & Co via Acme');
  assert.match(out.html, /Jo &lt;b&gt;Smith&lt;\/b&gt; \/ Big &amp; Co \/ jo@x\.com/);
});

test('footer adds business address and an unsubscribe link when the template has none', () => {
  const campaign = { id: 'c1', subject: 's', html_body: '<html><body><p>Hello</p></body></html>' };
  const out = renderEmail({ campaign, recipient: { id: 'r1', email: 'a@b.com', name: '' }, ...opts });
  assert.match(out.html, /1 Main St, Sydney/);
  assert.match(out.html, /href="https:\/\/api\.test\/u\/[^"]+"[^>]*>Unsubscribe/);
  assert.ok(out.html.indexOf('Unsubscribe') < out.html.indexOf('</body>'));
});

test('template {{unsubscribe_url}} is used instead of adding a second link', () => {
  const campaign = { id: 'c1', subject: 's', html_body: '<body><a href="{{unsubscribe_url}}">Opt out</a></body>' };
  const out = renderEmail({ campaign, recipient: { id: 'r1', email: 'a@b.com' }, ...opts });
  assert.equal((out.html.match(/\/u\//g) || []).length, 1);
  const token = out.unsubscribeUrl.split('/u/')[1];
  assert.deepEqual(verifyUnsubscribe('s3cret', token), { orgId: 'org1', email: 'a@b.com', campaignId: 'c1', recipientId: 'r1' });
});

test('links are wrapped with signed click tracking, our own links are left alone', () => {
  const html = '<body><a href="https://shop.com/x?a=1">Shop</a><a href="https://api.test/u/tok">Unsub</a></body>';
  const out = injectTracking(html, { baseUrl: 'https://api.test', campaignId: 'c1', recipientId: 'r1', secret: 's3cret' });
  const m = out.match(/href="https:\/\/api\.test\/track\/click\/c1\/r1\?url=([^&]+)&sig=([^"]+)"/);
  assert.ok(m, 'click link rewritten');
  assert.equal(decodeURIComponent(m[1]), 'https://shop.com/x?a=1');
  assert.ok(verifyClick('s3cret', 'c1', 'r1', 'https://shop.com/x?a=1', m[2]));
  assert.ok(out.includes('href="https://api.test/u/tok"'));
  assert.match(out, /track\/open\/c1\/r1/);
});

test('test sends (no recipient id) get no tracking', () => {
  const campaign = { id: 'c1', subject: 's', html_body: '<body><a href="https://shop.com">x</a></body>' };
  const out = renderEmail({ campaign, recipient: { email: 'a@b.com' }, ...opts });
  assert.ok(!out.html.includes('/track/'));
});

test('missingTags reports tags nothing can fill', () => {
  const campaign = { subject: '{{first_name}} {{promo_code}}', html_body: '{{ Intro Text }} {{company}} {{unsubscribe_url}}' };
  assert.deepEqual(missingTags(campaign, ['Company']), ['intro_text', 'promo_code']);
  assert.equal(normalizeKey(' First-Name '), 'first_name');
});

test('htmlToText keeps link targets and drops markup', () => {
  const text = htmlToText('<style>p{}</style><p>Hello <b>there</b></p><a href="https://x.com">Visit</a>');
  assert.equal(text, 'Hello there\nVisit (https://x.com)');
});
