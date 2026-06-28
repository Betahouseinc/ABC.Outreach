-- ============================================
-- Enable Row Level Security (RLS)
-- Defense-in-depth: restricts data access at DB level
-- ============================================
-- IMPORTANT: Run this ONLY after testing the backend
-- This adds an extra layer of security on top of API scoping
-- ============================================

-- ============================================
-- Enable RLS on all tables
-- ============================================

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE templates ENABLE ROW LEVEL SECURITY;

-- ============================================
-- RLS Policies
-- ============================================

-- Organizations: Users can view their own organization
CREATE POLICY "Users can view their organization" ON organizations
  FOR SELECT USING (
    id IN (
      SELECT org_id FROM users 
      WHERE id = auth.uid()::text
    )
  );

-- Organizations: Admins can update their organization
CREATE POLICY "Admins can update their organization" ON organizations
  FOR UPDATE USING (
    id IN (
      SELECT org_id FROM users 
      WHERE id = auth.uid()::text AND role = 'admin'
    )
  );

-- Profiles: Users can view their own profile
CREATE POLICY "Users can view their own profile" ON profiles
  FOR SELECT USING (
    id = auth.uid()::text
  );

-- Profiles: Users can view other profiles in their org
CREATE POLICY "Users can view their org's profiles" ON profiles
  FOR SELECT USING (
    org_id = (
      SELECT org_id FROM users 
      WHERE id = auth.uid()::text
    )
  );

-- Profiles: Admins can insert profiles in their org (for user creation)
CREATE POLICY "Admins can insert profiles in their org" ON profiles
  FOR INSERT WITH CHECK (
    org_id = (
      SELECT org_id FROM users 
      WHERE id = auth.uid()::text AND role = 'admin'
    )
  );

-- Profiles: Admins can update profiles in their org (for role changes)
CREATE POLICY "Admins can update profiles in their org" ON profiles
  FOR UPDATE USING (
    org_id = (
      SELECT org_id FROM users 
      WHERE id = auth.uid()::text AND role = 'admin'
    )
  );

-- Profiles: Admins can delete profiles in their org
CREATE POLICY "Admins can delete profiles in their org" ON profiles
  FOR DELETE USING (
    org_id = (
      SELECT org_id FROM users 
      WHERE id = auth.uid()::text AND role = 'admin'
    )
  );

-- Campaigns: Users can manage campaigns in their org
CREATE POLICY "Users can manage their org's campaigns" ON campaigns
  FOR ALL USING (
    org_id IN (
      SELECT org_id FROM users 
      WHERE id = auth.uid()::text
    )
  );

-- Recipients: Users can manage recipients in their org
CREATE POLICY "Users can manage their org's recipients" ON recipients
  FOR ALL USING (
    org_id IN (
      SELECT org_id FROM users 
      WHERE id = auth.uid()::text
    )
  );

-- Templates: Users can manage templates in their org
CREATE POLICY "Users can manage their org's templates" ON templates
  FOR ALL USING (
    org_id IN (
      SELECT org_id FROM users 
      WHERE id = auth.uid()::text
    )
  );

-- ============================================
-- RLS ENABLED
-- ============================================
-- Note: The backend already scopes all queries by org_id
-- RLS provides defense-in-depth at the database level
-- ============================================