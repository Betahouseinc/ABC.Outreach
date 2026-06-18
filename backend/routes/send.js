const express = require('express');
const router = express.Router();
const { Resend } = require('resend');
const db = require('../db');

const BATCH_SIZE = 10;
const DELAY_MS = 1100;

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function injectTracking(html, recipientId, campaignId, baseUrl) {
  const pixelUrl = `${baseUrl}/track/open/${campaignId}/${recipientId}`;
  const pixel = `<img src="${pixelUrl}" width="1" height="1" style="display:none" alt="">`;

  let tracked = html.replace(/<\/body>/i, `${pixel}</body>`);

  tracked = tracked.replace(/href="(https?:\/\/[^"]+)"/g, (match, url) => {
    if (url.includes('/track/')) return match;
    const encoded = encodeURIComponent(url);
    return `href="${baseUrl}/track/click/${campaignId}/${recipientId}?url=${encoded}"`;
  });

  return tracked;
}

router.post('/:id/send', async (req, res) => {
  const campaign = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(req.params.id);
  if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
  if (campaign.status === 'sending') return res.status(400).json({ error: 'Already sending' });
  if (campaign.status === 'sent') return res.status(400).json({ error: 'Already sent' });

  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) return res.status(500).json({ error: 'RESEND_API_KEY not set' });

  const resend = new Resend(resendKey);
  const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3001}`;

  const pending = db.prepare("SELECT * FROM recipients WHERE campaign_id = ? AND status = 'pending'").all(campaign.id);
  if (!pending.length) return res.status(400).json({ error: 'No pending recipients' });

  db.prepare("UPDATE campaigns SET status = 'sending' WHERE id = ?").run(campaign.id);
  res.json({ message: 'Sending started', total: pending.length });

  (async () => {
    let sent = 0, failed = 0;
    for (let i = 0; i < pending.length; i += BATCH_SIZE) {
      const batch = pending.slice(i, i + BATCH_SIZE);
      await Promise.all(batch.map(async (r) => {
        try {
          const html = injectTracking(campaign.html_body, r.id, campaign.id, baseUrl);
          await resend.emails.send({
            from: `${campaign.from_name} <${campaign.from_email}>`,
            to: r.email,
            subject: campaign.subject,
            html
          });
          db.prepare("UPDATE recipients SET status = 'sent' WHERE id = ?").run(r.id);
          sent++;
        } catch (err) {
          db.prepare("UPDATE recipients SET status = 'failed', error_msg = ? WHERE id = ?").run(err.message, r.id);
          failed++;
        }
      }));
      db.prepare('UPDATE campaigns SET sent_count = ?, failed_count = ? WHERE id = ?').run(sent, failed, campaign.id);
      if (i + BATCH_SIZE < pending.length) await sleep(DELAY_MS);
    }
    db.prepare("UPDATE campaigns SET status = 'sent', sent_at = CURRENT_TIMESTAMP WHERE id = ?").run(campaign.id);
  })();
});

router.get('/:id/progress', (req, res) => {
  const campaign = db.prepare('SELECT status, total_recipients, sent_count, failed_count, open_count, click_count FROM campaigns WHERE id = ?').get(req.params.id);
  if (!campaign) return res.status(404).json({ error: 'Not found' });
  res.json(campaign);
});

module.exports = router;
