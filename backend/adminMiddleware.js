// Determines admin status. Two ways to be an admin (either is enough):
//  1) email listed in ADMIN_EMAILS (comma-separated) — used to bootstrap the first admin
//  2) app_metadata.is_admin === true — set when created via the in-app admin page
function isAdminUser(user) {
  if (!user) return false;
  const allow = (process.env.ADMIN_EMAILS || '')
    .split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  if (user.email && allow.includes(user.email.toLowerCase())) return true;
  if (user.app_metadata && user.app_metadata.is_admin === true) return true;
  return false;
}

// Must run AFTER requireAuth (which sets req.user).
function requireAdmin(req, res, next) {
  if (!isAdminUser(req.user)) return res.status(403).json({ error: 'Admin access required' });
  next();
}

// Platform owner (OWNER_EMAILS): sees every company, e.g. monthly usage for billing.
// Separate from org admins, who only ever see their own company.
function isOwnerUser(user) {
  const owners = (process.env.OWNER_EMAILS || '')
    .split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  return !!(user && user.email && owners.includes(user.email.toLowerCase()));
}

function requireOwner(req, res, next) {
  if (!isOwnerUser(req.user)) return res.status(403).json({ error: 'Owner access required' });
  next();
}

module.exports = { requireAdmin, isAdminUser, requireOwner, isOwnerUser };
