-- ============================================
-- 005: production readiness (eXoMail v1.1)
-- Idempotent: safe to re-run. Run in Supabase → SQL Editor.
--
-- * Suppression list, SES events, sending domains
-- * Business address (footer), recipient CSV fields, SES message ids
-- * Replaces the 004 RLS policies (they referenced a "users" table that doesn't exist)
--   and enables RLS on every table.
-- The backend uses the service-role key, which bypasses RLS, so the app is unaffected.
-- ============================================

-- ---------- New columns ----------
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS business_address text;

ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS last_error text;

ALTER TABLE recipients ADD COLUMN IF NOT EXISTS fields jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE recipients ADD COLUMN IF NOT EXISTS message_id text;
ALTER TABLE recipients ADD COLUMN IF NOT EXISTS sent_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_recipients_message_id ON recipients(message_id);
CREATE INDEX IF NOT EXISTS idx_recipients_pending ON recipients(campaign_id, status, id);

-- ---------- Suppression list ----------
CREATE TABLE IF NOT EXISTS suppressions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email text NOT NULL,
  reason text NOT NULL CHECK (reason IN ('bounce', 'complaint', 'unsubscribe', 'manual')),
  detail text,
  created_at timestamptz DEFAULT now(),
  UNIQUE (org_id, email)
);
CREATE INDEX IF NOT EXISTS idx_suppressions_org ON suppressions(org_id, created_at DESC);

-- ---------- Events (send / delivery / bounce / complaint / reject / unsubscribe) ----------
-- campaign_id / recipient_id are plain text (no FK): events outlive deleted campaigns.
CREATE TABLE IF NOT EXISTS events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  campaign_id text,
  recipient_id text,
  message_id text,
  email text,
  type text NOT NULL,
  detail jsonb,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_events_message ON events(message_id, type);
CREATE INDEX IF NOT EXISTS idx_events_org ON events(org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_campaign ON events(campaign_id);

-- ---------- Sending domains ----------
-- A domain belongs to one organization (unique across all orgs).
CREATE TABLE IF NOT EXISTS sender_domains (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  domain text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'not_found')),
  dkim_status text,
  mail_from_status text,
  last_checked_at timestamptz,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sender_domains_org ON sender_domains(org_id);

-- ---------- RLS helpers ----------
-- SECURITY DEFINER so policies can read profiles without recursing into profiles' own policies.
CREATE OR REPLACE FUNCTION public.current_org_id() RETURNS uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
$$ SELECT org_id FROM public.profiles WHERE id = auth.uid() $$;

CREATE OR REPLACE FUNCTION public.is_org_admin() RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
$$ SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin') $$;

REVOKE ALL ON FUNCTION public.current_org_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_org_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_org_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_org_admin() TO authenticated;

-- ---------- Drop the broken 004 policies (if they were ever created) ----------
DROP POLICY IF EXISTS "Users can view their organization" ON organizations;
DROP POLICY IF EXISTS "Admins can update their organization" ON organizations;
DROP POLICY IF EXISTS "Users can view their own profile" ON profiles;
DROP POLICY IF EXISTS "Users can view their org's profiles" ON profiles;
DROP POLICY IF EXISTS "Admins can insert profiles in their org" ON profiles;
DROP POLICY IF EXISTS "Admins can update profiles in their org" ON profiles;
DROP POLICY IF EXISTS "Admins can delete profiles in their org" ON profiles;
DROP POLICY IF EXISTS "Users can manage their org's campaigns" ON campaigns;
DROP POLICY IF EXISTS "Users can manage their org's recipients" ON recipients;
DROP POLICY IF EXISTS "Users can manage their org's templates" ON templates;

-- ---------- Enable RLS everywhere ----------
ALTER TABLE organizations  ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles       ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaigns      ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipients     ENABLE ROW LEVEL SECURITY;
ALTER TABLE templates      ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppressions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE events         ENABLE ROW LEVEL SECURITY;
ALTER TABLE sender_domains ENABLE ROW LEVEL SECURITY;

-- ---------- Policies (v1.1) ----------
DROP POLICY IF EXISTS org_select ON organizations;
CREATE POLICY org_select ON organizations FOR SELECT TO authenticated USING (id = public.current_org_id());
DROP POLICY IF EXISTS org_admin_update ON organizations;
CREATE POLICY org_admin_update ON organizations FOR UPDATE TO authenticated
  USING (id = public.current_org_id() AND public.is_org_admin())
  WITH CHECK (id = public.current_org_id());

DROP POLICY IF EXISTS profiles_select ON profiles;
CREATE POLICY profiles_select ON profiles FOR SELECT TO authenticated USING (org_id = public.current_org_id());
DROP POLICY IF EXISTS profiles_admin_write ON profiles;
CREATE POLICY profiles_admin_write ON profiles FOR ALL TO authenticated
  USING (org_id = public.current_org_id() AND public.is_org_admin())
  WITH CHECK (org_id = public.current_org_id() AND public.is_org_admin());

DROP POLICY IF EXISTS campaigns_org ON campaigns;
CREATE POLICY campaigns_org ON campaigns FOR ALL TO authenticated
  USING (org_id = public.current_org_id()) WITH CHECK (org_id = public.current_org_id());

DROP POLICY IF EXISTS recipients_org ON recipients;
CREATE POLICY recipients_org ON recipients FOR ALL TO authenticated
  USING (org_id = public.current_org_id()) WITH CHECK (org_id = public.current_org_id());

DROP POLICY IF EXISTS templates_org ON templates;
CREATE POLICY templates_org ON templates FOR ALL TO authenticated
  USING (org_id = public.current_org_id()) WITH CHECK (org_id = public.current_org_id());

-- Written only by the backend (service role); members can read their org's rows.
DROP POLICY IF EXISTS suppressions_select ON suppressions;
CREATE POLICY suppressions_select ON suppressions FOR SELECT TO authenticated USING (org_id = public.current_org_id());

DROP POLICY IF EXISTS events_select ON events;
CREATE POLICY events_select ON events FOR SELECT TO authenticated USING (org_id = public.current_org_id());

DROP POLICY IF EXISTS sender_domains_select ON sender_domains;
CREATE POLICY sender_domains_select ON sender_domains FOR SELECT TO authenticated USING (org_id = public.current_org_id());

-- ---------- Verify (step 7) ----------
-- Every row should show rowsecurity = true:
-- SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public'
--   AND tablename IN ('organizations','profiles','campaigns','recipients','templates','suppressions','events','sender_domains')
--   ORDER BY tablename;
