require('dotenv').config();
const express = require('express');
const cors = require('cors');
const config = require('./config');
const requireAuth = require('./authMiddleware');
const orgMiddleware = require('./orgMiddleware');
const { securityHeaders, rateLimit } = require('./lib/security');

const app = express();
// Behind Caddy on the same server: trust only its X-Forwarded-For, so clients can't spoof their IP.
app.set('trust proxy', 'loopback');
app.disable('x-powered-by');
app.use(securityHeaders);

// PUBLIC — hit by recipients' mail clients and by Amazon SNS, so no auth and no CORS.
app.use('/track', rateLimit({ windowMs: 60_000, max: 300 }), require('./routes/track'));
app.use('/u', rateLimit({ windowMs: 60_000, max: 30 }), require('./routes/unsubscribe'));
app.use('/webhooks', rateLimit({ windowMs: 60_000, max: 600 }), require('./routes/webhooks'));
app.get('/health', (req, res) => res.json({ ok: true, provider: config.provider, dryRun: config.dryRun }));
// Also checks the database. The server's daily cron calls it, which stops the free Supabase project pausing.
app.get('/health/db', rateLimit({ windowMs: 60_000, max: 30 }), async (req, res) => {
  const { error } = await require('./db').from('organizations').select('id', { head: true, count: 'exact' }).limit(1);
  if (error) return res.status(503).json({ ok: false, db: 'unreachable' });
  res.json({ ok: true, db: 'ok' });
});

// PROTECTED — browser API: CORS locked to FRONTEND_URL, and a valid Supabase session required.
const api = express.Router();
api.use(rateLimit({ windowMs: 60_000, max: 300 }));
api.use(cors({
  // Unknown origins get no CORS headers (the browser blocks them) rather than a 500.
  origin: (origin, cb) => cb(null, !origin || config.frontendUrls.includes(origin))
}));
api.use(express.json({ limit: '10mb' }));
api.use('/templates', requireAuth, orgMiddleware, require('./routes/templates'));
api.use('/campaigns', requireAuth, orgMiddleware, require('./routes/campaigns'));
api.use('/campaigns', requireAuth, orgMiddleware, require('./routes/send'));
api.use('/settings', requireAuth, orgMiddleware, require('./routes/settings'));
api.use('/admin', requireAuth, orgMiddleware, require('./routes/admin'));
app.use('/api', api);

if (require.main === module) {
  // HOST=127.0.0.1 on the server so only Caddy can reach the app port.
  app.listen(config.port, process.env.HOST || undefined, () => console.log(`exo-mail backend running on http://localhost:${config.port} (provider: ${config.provider}, dry run: ${config.dryRun})`));
}

module.exports = app;
