require('dotenv').config();
const express = require('express');
const cors = require('cors');
const db = require('./db');
const { seedTemplates } = require('./templates');
const requireAuth = require('./authMiddleware');
const orgMiddleware = require('./orgMiddleware');

const app = express();
const PORT = process.env.PORT || 3001;

// Lock CORS to known frontend origin(s). FRONTEND_URL may be comma-separated.
const allowed = (process.env.FRONTEND_URL || 'http://localhost:5173')
  .split(',').map(s => s.trim()).filter(Boolean);
app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowed.includes(origin)) return cb(null, true);
    return cb(new Error('Not allowed by CORS'));
  }
}));

app.use(express.json({ limit: '10mb' }));

seedTemplates(db);

// PUBLIC — open/click tracking is hit by recipients' mail clients, must stay unauthenticated.
app.use('/track', require('./routes/track'));
app.get('/health', (req, res) => res.json({ ok: true }));

// PROTECTED — all data access and sending requires a valid Supabase session.
app.use('/api/templates', requireAuth, orgMiddleware, require('./routes/templates'));
app.use('/api/campaigns', requireAuth, orgMiddleware, require('./routes/campaigns'));
app.use('/api/campaigns', requireAuth, orgMiddleware, require('./routes/send'));
app.use('/api/admin', requireAuth, orgMiddleware, require('./routes/admin'));

app.listen(PORT, () => console.log(`exo-mail backend running on http://localhost:${PORT}`));
