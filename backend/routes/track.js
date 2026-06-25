const express = require('express');
const router = express.Router();
const db = require('../db');

const PIXEL = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');

router.get('/open/:campaignId/:recipientId', async (req, res) => {
  const { campaignId, recipientId } = req.params;
  try {
    // Verify campaign exists and get its org_id
    const { data: campaign } = await db.from('campaigns').select('org_id').eq('id', campaignId).single();
    if (!campaign) return res.send(PIXEL); // Invalid campaign, return pixel without tracking
    
    // Verify recipient belongs to this campaign and org
    const { data: r } = await db.from('recipients')
      .select('opened')
      .eq('id', recipientId)
      .eq('campaign_id', campaignId)
      .eq('org_id', campaign.org_id)
      .single();
    
    if (r && !r.opened) {
      await db.from('recipients').update({ opened: true, open_at: new Date().toISOString() }).eq('id', recipientId).eq('org_id', campaign.org_id);
      const { data: c } = await db.from('campaigns').select('open_count').eq('id', campaignId).single();
      await db.from('campaigns').update({ open_count: (c?.open_count || 0) + 1 }).eq('id', campaignId).eq('org_id', campaign.org_id);
    }
  } catch (_) {}
  res.set({ 'Content-Type': 'image/gif', 'Cache-Control': 'no-store' });
  res.send(PIXEL);
});

router.get('/click/:campaignId/:recipientId', async (req, res) => {
  const { campaignId, recipientId } = req.params;
  const { url } = req.query;
  try {
    // Verify campaign exists and get its org_id
    const { data: campaign } = await db.from('campaigns').select('org_id').eq('id', campaignId).single();
    if (!campaign) return res.send('OK'); // Invalid campaign, return OK without tracking
    
    // Verify recipient belongs to this campaign and org
    const { data: r } = await db.from('recipients')
      .select('clicked')
      .eq('id', recipientId)
      .eq('campaign_id', campaignId)
      .eq('org_id', campaign.org_id)
      .single();
    
    if (r && !r.clicked) {
      await db.from('recipients').update({ clicked: true, click_at: new Date().toISOString() }).eq('id', recipientId).eq('org_id', campaign.org_id);
      const { data: c } = await db.from('campaigns').select('click_count').eq('id', campaignId).single();
      await db.from('campaigns').update({ click_count: (c?.click_count || 0) + 1 }).eq('id', campaignId).eq('org_id', campaign.org_id);
    }
  } catch (_) {}
  if (url) return res.redirect(decodeURIComponent(url));
  res.send('OK');
});

module.exports = router;
