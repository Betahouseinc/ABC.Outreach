-- Phase 1: Multi-tenancy foundation
-- Idempotent migration — safe to re-run
-- Does NOT enable RLS (that comes after backend scoping is tested)

-- 1. Create organizations table
CREATE TABLE IF NOT EXISTS organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz default now()
);

-- 2. Create profiles table (extends auth.users)
CREATE TABLE IF NOT EXISTS profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  org_id uuid not null references organizations(id) on delete cascade,
  email text,
  full_name text,
  role text default 'member',
  created_at timestamptz default now()
);

-- 3. Add org_id columns (nullable initially for backfill)
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS org_id uuid;
ALTER TABLE recipients ADD COLUMN IF NOT EXISTS org_id uuid;
ALTER TABLE templates ADD COLUMN IF NOT EXISTS org_id uuid;

-- 4. Backfill: create default org and assign all existing rows
DO $$
DECLARE
  default_org_id uuid;
BEGIN
  SELECT id INTO default_org_id FROM organizations LIMIT 1;
  IF default_org_id IS NULL THEN
    INSERT INTO organizations (name) VALUES ('Default Organization') RETURNING id INTO default_org_id;
  END IF;
  UPDATE campaigns SET org_id = default_org_id WHERE org_id IS NULL;
  UPDATE recipients SET org_id = default_org_id WHERE org_id IS NULL;
  UPDATE templates SET org_id = default_org_id WHERE org_id IS NULL;
END $$;

-- 5. Add NOT NULL constraints (safe because backfill is done)
ALTER TABLE campaigns ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE recipients ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE templates ALTER COLUMN org_id SET NOT NULL;

-- 6. Add foreign keys (idempotent)
DO $$
BEGIN
  ALTER TABLE campaigns ADD CONSTRAINT fk_campaigns_org FOREIGN KEY (org_id) REFERENCES organizations(id) on delete cascade;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE recipients ADD CONSTRAINT fk_recipients_org FOREIGN KEY (org_id) REFERENCES organizations(id) on delete cascade;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE templates ADD CONSTRAINT fk_templates_org FOREIGN KEY (org_id) REFERENCES organizations(id) on delete cascade;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 7. Indexes for performance
CREATE INDEX IF NOT EXISTS idx_campaigns_org ON campaigns(org_id);
CREATE INDEX IF NOT EXISTS idx_recipients_org ON recipients(org_id);
CREATE INDEX IF NOT EXISTS idx_templates_org ON templates(org_id);
CREATE INDEX IF NOT EXISTS idx_profiles_org ON profiles(org_id);