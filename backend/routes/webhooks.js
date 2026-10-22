// PUBLIC SNS endpoint for SES events (bounce, complaint, delivery, reject, rendering failure).
const express = require('express');
const router = express.Router();
const config = require('../config');
const store = require('../lib/store');
const sns = require('../lib/sns');
const { handleSesEvent } = require('../lib/sesEvents');

// SNS posts JSON with Content-Type text/plain, so read the raw body.
router.post('/ses', express.text({ type: '*/*', limit: '256kb' }), async (req, res) => {
  let msg;
  try { msg = JSON.parse(req.body); } catch (_) { return res.status(400).send('Bad JSON'); }

  if (!config.snsTopicArn || msg.TopicArn !== config.snsTopicArn) return res.status(403).send('Unexpected topic');
  try {
    if (!(await sns.verify(msg))) return res.status(403).send('Bad signature');
  } catch (err) {
    console.error('[exo-mail] SNS signature check failed:', err.message);
    return res.status(500).send('Signature check failed');
  }

  try {
    if (msg.Type === 'SubscriptionConfirmation') {
      await sns.confirmSubscription(msg.SubscribeURL);
      console.log(`[exo-mail] confirmed SNS subscription to ${msg.TopicArn}`);
    } else if (msg.Type === 'Notification') {
      const out = await handleSesEvent(store, JSON.parse(msg.Message));
      if (out.actions && out.actions.length) console.log(`[exo-mail] SES ${out.type}: ${out.actions.join(', ')}`);
    }
    res.send('OK');
  } catch (err) {
    // A 5xx makes SNS retry later.
    console.error('[exo-mail] SES webhook error:', err.message);
    res.status(500).send('Error');
  }
});

module.exports = router;
