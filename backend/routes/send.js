const express = require('express');
const router = express.Router();
const { Resend } = require('resend');
const db = require('../db');

const BATCH_SIZE = 10;
const DELAY_MS = 1100;

// Safe by default: real email is sent ONLY when EMAIL_DRY_RUN is explicitly "false".
// Missing var, "true", or anything else => dry run (logs instead of sending).
const DRY_RUN = process.env.EMAIL_DRY_RUN !== 'false';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function injectTracking(html, recipientId, campaignId, baseUrl) {
  const pixel = `<img src="${baseUrl}/track/open/${campaignId}/${recipientId}" width="1" height="1" style="display:none" alt="">`;
  let tracked = html.replace(/<\/body>/i, `${pixel}</body>`);
  tracked = tracked.replace(/href="(https?:\/\/[^"]+)"/g, (match, url) => {
    if (url.includes('/track/')) return match;
    return `href="${baseUrl}/track/click/${campaignId}/${recipientId}?url=${encodeURIComponent(url)}"`;
  });
  return tracked;
}

router.post('/:id/send', async (req, res) => {
  const { data: campaign } = await db.from('campaigns').select('*').eq('id', req.params.id).single();
  if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
  if (campaign.status === 'sending') return res.status(400).json({ error: 'Already sending' });
  if (campaign.status === 'sent') return res.status(400).json({ error: 'Already sent' });

  const resendKey = process.env.RESEND_API_KEY;
  // RESEND_API_KEY is only required for real sends. Dry run does not need it.
  if (!DRY_RUN && !resendKey) return res.status(500).json({ error: 'RESEND_API_KEY not set' });

  const resend = DRY_RUN ? null : new Resend(resendKey);
  const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3001}`;

  const { data: pending } = await db.from('recipients').select('*').eq('campaign_id', campaign.id).eq('status', 'pending');
  if (!pending?.length) return res.status(400).json({ error: 'No pending recipients' });

  await db.from('campaigns').update({ status: 'sending' }).eq('id', campaign.id);
  res.json({ message: DRY_RUN ? 'Sending started (DRY RUN — no real email)' : 'Sending started', total: pending.length, dryRun: DRY_RUN });

  if (DRY_RUN) console.log(`[exo-mail] DRY RUN for campaign ${campaign.id} — ${pending.length} recipient(s), no real email sent.`);

  (async () => {
    let sent = 0, failed = 0;
    for (let i = 0; i < pending.length; i += BATCH_SIZE) {
      const batch = pending.slice(i, i + BATCH_SIZE);
      await Promise.all(batch.map(async (r) => {
        try {
          const html = injectTracking(campaign.html_body, r.id, campaign.id, baseUrl);
          if (DRY_RUN) {
            console.log(`[exo-mail][dry-run] would send → ${r.email} | subject: ${campaign.subject}`);
          } else {
            await resend.emails.send({
              from: `${campaign.from_name} <${campaign.from_email}>`,
              to: r.email,
              subject: campaign.subject,
              html
            });
          }
          await db.from('recipients').update({ status: 'sent' }).eq('id', r.id);
          sent++;
        } catch (err) {
          await db.from('recipients').update({ status: 'failed', error_msg: err.message }).eq('id', r.id);
          failed++;
        }
      }));
      await db.from('campaigns').update({ sent_count: sent, failed_count: failed }).eq('id', campaign.id);
      if (i + BATCH_SIZE < pending.length) await sleep(DELAY_MS);
    }
    await db.from('campaigns').update({ status: 'sent', sent_at: new Date().toISOString() }).eq('id', campaign.id);
  })();
});

router.get('/:id/progress', async (req, res) => {
  const { data, error } = await db.from('campaigns')
    .select('status, total_recipients, sent_count, failed_count, open_count, click_count')
    .eq('id', req.params.id).single();
  if (error) return res.status(404).json({ error: 'Not found' });
  res.json(data);
});

module.exports = router;
