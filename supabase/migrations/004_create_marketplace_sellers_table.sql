create table if not exists marketplace_sellers (
  id bigint generated always as identity primary key,
  date text not null,
  platform text not null check (platform in ('AD', 'GD')),
  account_id text not null,
  company_name text not null,
  country text,
  state text,
  listing_count integer,
  total_current_bid real,
  total_bids integer,
  created_at timestamptz default now()
);

alter table marketplace_sellers enable row level security;
create policy "Public read access" on marketplace_sellers for select using (true);

create index idx_marketplace_sellers_date on marketplace_sellers (date desc, platform);
create index idx_marketplace_sellers_account on marketplace_sellers (account_id, date desc);
