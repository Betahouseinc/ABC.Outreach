require('dotenv').config();
const express = require('express');
const cors = require('cors');
const config = require('./config');
const requireAuth = require('./authMiddleware');
const orgMiddleware = require('./orgMiddleware');

const app = express();
app.set('trust proxy', true); // behind Fly's proxy

// PUBLIC — hit by recipients' mail clients and by Amazon SNS, so no auth and no CORS.
app.use('/track', require('./routes/track'));
app.use('/u', require('./routes/unsubscribe'));
app.use('/webhooks', require('./routes/webhooks'));
app.get('/health', (req, res) => res.json({ ok: true, provider: config.provider, dryRun: config.dryRun }));

// PROTECTED — browser API: CORS locked to FRONTEND_URL, and a valid Supabase session required.
const api = express.Router();
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
  app.listen(config.port, () => console.log(`exo-mail backend running on http://localhost:${config.port} (provider: ${config.provider}, dry run: ${config.dryRun})`));
}

module.exports = app;
