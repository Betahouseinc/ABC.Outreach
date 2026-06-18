const express = require('express');
const router = express.Router();
const db = require('../db');

const PIXEL = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');

router.get('/open/:campaignId/:recipientId', (req, res) => {
  const { campaignId, recipientId } = req.params;
  try {
    const r = db.prepare('SELECT opened FROM recipients WHERE id = ? AND campaign_id = ?').get(recipientId, campaignId);
    if (r && !r.opened) {
      db.prepare('UPDATE recipients SET opened = 1, open_at = CURRENT_TIMESTAMP WHERE id = ?').run(recipientId);
      db.prepare('UPDATE campaigns SET open_count = open_count + 1 WHERE id = ?').run(campaignId);
    }
  } catch (_) {}
  res.set({ 'Content-Type': 'image/gif', 'Cache-Control': 'no-store, no-cache, must-revalidate' });
  res.send(PIXEL);
});

router.get('/click/:campaignId/:recipientId', (req, res) => {
  const { campaignId, recipientId } = req.params;
  const { url } = req.query;
  try {
    const r = db.prepare('SELECT clicked FROM recipients WHERE id = ? AND campaign_id = ?').get(recipientId, campaignId);
    if (r && !r.clicked) {
      db.prepare('UPDATE recipients SET clicked = 1, click_at = CURRENT_TIMESTAMP WHERE id = ?').run(recipientId);
      db.prepare('UPDATE campaigns SET click_count = click_count + 1 WHERE id = ?').run(campaignId);
    }
  } catch (_) {}
  if (url) return res.redirect(decodeURIComponent(url));
  res.send('OK');
});

module.exports = router;
