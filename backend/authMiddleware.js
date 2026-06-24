// Verifies a Supabase user JWT sent as "Authorization: Bearer <token>".
// Returns 401 if the token is missing, invalid, or expired.
const db = require('./db'); // Supabase client (service role) — also validates user JWTs

async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Authentication required' });
  try {
    const { data, error } = await db.auth.getUser(token);
    if (error || !data?.user) return res.status(401).json({ error: 'Invalid or expired session' });
    req.user = data.user;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Auth check failed' });
  }
}

module.exports = requireAuth;
