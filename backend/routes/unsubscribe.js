// PUBLIC unsubscribe link: GET shows a confirm page, POST unsubscribes.
// POST is also what mail clients send for one-click unsubscribe (RFC 8058).
const express = require('express');
const router = express.Router();
const config = require('../config');
const store = require('../lib/store');
const { verifyUnsubscribe } = require('../lib/tokens');
const { escapeHtml } = require('../lib/render');

function page(title, body) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${title}</title>
<style>body{font-family:-apple-system,Segoe UI,Arial,sans-serif;background:#f5f5f5;color:#222;margin:0;padding:48px 16px}main{max-width:440px;margin:0 auto;background:#fff;border-radius:10px;padding:32px;text-align:center}h1{font-size:20px;margin:0 0 12px}p{color:#555;line-height:1.5}button{background:#111;color:#fff;border:0;border-radius:8px;padding:12px 22px;font-size:15px;cursor:pointer}</style>
</head><body><main>${body}</main></body></html>`;
}

router.get('/:token', (req, res) => {
  const t = verifyUnsubscribe(config.appSecret, req.params.token);
  if (!t) return res.status(400).send(page('Invalid link', '<h1>This link is not valid</h1><p>It may have been copied incompletely.</p>'));
  res.send(page('Unsubscribe', `<h1>Unsubscribe</h1><p>Stop receiving these emails at <strong>${escapeHtml(t.email)}</strong>?</p>
<form method="post"><button type="submit">Unsubscribe</button></form>`));
});

router.post('/:token', express.urlencoded({ extended: false }), async (req, res) => {
  const t = verifyUnsubscribe(config.appSecret, req.params.token);
  if (!t) return res.status(400).send(page('Invalid link', '<h1>This link is not valid</h1>'));
  try {
    await store.addSuppression(t.orgId, t.email, 'unsubscribe', t.campaignId);
    await store.insertEvent({ org_id: t.orgId, campaign_id: t.campaignId, recipient_id: t.recipientId, message_id: null, email: t.email, type: 'unsubscribe', detail: null });
    if (t.recipientId) await store.updateRecipientIf(t.recipientId, ['pending', 'sent', 'delivered'], { status: 'unsubscribed' });
  } catch (err) {
    console.error('[exo-mail] unsubscribe failed:', err.message);
    return res.status(500).send(page('Something went wrong', '<h1>Something went wrong</h1><p>Please try the link again in a minute.</p>'));
  }
  res.send(page('Unsubscribed', `<h1>You're unsubscribed</h1><p>${escapeHtml(t.email)} won't receive these emails any more.</p>`));
});

module.exports = router;
