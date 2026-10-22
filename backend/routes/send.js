const express = require('express');
const router = express.Router();
const config = require('../config');
const store = require('../lib/store');
const mailer = require('../lib/mailer');
const { createSender } = require('../lib/sender');
const { EMAIL_RE } = require('../lib/csv');

const sender = createSender({ store, mailer, config });

async function loadCampaign(req, res) {
  const campaign = await store.getCampaign(req.orgId, req.params.id);
  if (!campaign) res.status(404).json({ error: 'Campaign not found' });
  return campaign;
}

// Real send. Refuses while EMAIL_DRY_RUN is on, and when any pre-flight check fails.
router.post('/:id/send', async (req, res) => {
  try {
    const campaign = await loadCampaign(req, res);
    if (!campaign) return;
    const out = await sender.startCampaign(req.orgId, campaign);
    if (out.status !== 200) return res.status(out.status).json({ error: out.error, errors: out.errors });
    out.done.catch(err => console.error(`[exo-mail] send loop crashed for ${campaign.id}:`, err));
    res.json({ message: 'Sending started', total: out.pending });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Full pipeline without sending: checks, counts and a rendered preview of the first recipient.
router.post('/:id/test-run', async (req, res) => {
  try {
    const campaign = await loadCampaign(req, res);
    if (!campaign) return;
    res.json(await sender.testRun(req.orgId, campaign));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Sends the campaign (subject prefixed "[TEST]") to up to 5 addresses.
router.post('/:id/send-test', async (req, res) => {
  try {
    const campaign = await loadCampaign(req, res);
    if (!campaign) return;
    const emails = [...new Set((req.body.emails || []).map(e => String(e).trim().toLowerCase()).filter(Boolean))];
    if (!emails.length || emails.length > 5) return res.status(400).json({ error: 'Enter between 1 and 5 email addresses' });
    const bad = emails.filter(e => !EMAIL_RE.test(e));
    if (bad.length) return res.status(400).json({ error: `Not valid: ${bad.join(', ')}` });
    const out = await sender.sendTest(req.orgId, campaign, emails);
    res.status(out.ok ? 200 : 400).json(out.ok ? out : { error: out.errors.join(' '), errors: out.errors });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id/progress', async (req, res) => {
  try {
    const campaign = await store.getCampaign(req.orgId, req.params.id);
    if (!campaign) return res.status(404).json({ error: 'Not found' });
    const { status, total_recipients, sent_count, failed_count, open_count, click_count, last_error } = campaign;
    const status_counts = await store.statusCounts(campaign.id, req.orgId);
    res.json({ status, total_recipients, sent_count, failed_count, open_count, click_count, last_error, status_counts });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
