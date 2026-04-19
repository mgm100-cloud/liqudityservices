create table if not exists sam_opportunities (
  id bigint generated always as identity primary key,
  notice_id text unique not null,
  title text not null,
  solicitation_number text,
  organization text,
  posted_date text,
  response_deadline text,
  notice_type text,
  base_type text,
  naics_code text,
  classification_code text,
  description_url text,
  ui_link text,
  awardee_name text,
  awardee_uei text,
  award_amount numeric,
  award_date text,
  first_seen_date text not null,
  created_at timestamptz default now()
);

alter table sam_opportunities enable row level security;
create policy "Public read access" on sam_opportunities for select using (true);

create index if not exists idx_sam_opportunities_posted_date on sam_opportunities (posted_date desc);
create index if not exists idx_sam_opportunities_awardee_uei on sam_opportunities (awardee_uei);
create index if not exists idx_sam_opportunities_notice_type on sam_opportunities (notice_type);
