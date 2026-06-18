require('dotenv').config();
const express = require('express');
const cors = require('cors');
const db = require('./db');
const { seedTemplates } = require('./templates');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

seedTemplates(db);

app.use('/api/templates', require('./routes/templates'));
app.use('/api/campaigns', require('./routes/campaigns'));
app.use('/api/campaigns', require('./routes/send'));
app.use('/track', require('./routes/track'));

app.get('/health', (req, res) => res.json({ ok: true }));

app.listen(PORT, () => console.log(`Email tool backend running on http://localhost:${PORT}`));
