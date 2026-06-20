-- Run this in Supabase → SQL Editor

create table if not exists templates (
  id text primary key,
  name text not null,
  category text,
  subject text not null,
  html_body text not null,
  created_at timestamptz default now()
);

create table if not exists campaigns (
  id text primary key,
  name text not null,
  subject text not null,
  from_name text not null,
  from_email text not null,
  template_id text,
  html_body text not null,
  status text default 'draft',
  total_recipients integer default 0,
  sent_count integer default 0,
  failed_count integer default 0,
  open_count integer default 0,
  click_count integer default 0,
  created_at timestamptz default now(),
  sent_at timestamptz
);

create table if not exists recipients (
  id text primary key,
  campaign_id text not null references campaigns(id) on delete cascade,
  email text not null,
  name text,
  status text default 'pending',
  opened boolean default false,
  clicked boolean default false,
  open_at timestamptz,
  click_at timestamptz,
  error_msg text
);

create index if not exists idx_recipients_campaign on recipients(campaign_id);
create index if not exists idx_recipients_status on recipients(campaign_id, status);
