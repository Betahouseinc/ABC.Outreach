const db = require('./db');

async function orgMiddleware(req, res, next) {
  try {
    const { data: profile, error } = await db
      .from('profiles')
      .select('org_id')
      .eq('id', req.user.id)
      .single();

    if (error || !profile) {
      return res.status(403).json({ error: 'No organization found for this user' });
    }

    req.orgId = profile.org_id;
    next();
  } catch (err) {
    return res.status(500).json({ error: 'Failed to load organization' });
  }
}

module.exports = orgMiddleware;