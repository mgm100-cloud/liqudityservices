create table if not exists marketplace_metrics (
  id bigint generated always as identity primary key,
  date text not null,
  timestamp text not null,
  platform text not null check (platform in ('AD', 'GD')),
  total_listings integer,
  total_bids integer,
  avg_bids_per_listing real,
  total_current_price real,
  listings_with_bids integer,
  bid_rate real,
  unique_seller_count integer,
  listings_closing_24h integer,
  avg_watch_count real,
  top_categories jsonb,
  sample_size integer,
  created_at timestamptz default now()
);

alter table marketplace_metrics enable row level security;
create policy "Public read access" on marketplace_metrics for select using (true);

-- Index for chronological queries
create index idx_marketplace_metrics_date on marketplace_metrics (date desc, timestamp desc);

-- Index for platform-specific queries
create index idx_marketplace_metrics_platform on marketplace_metrics (platform, date desc);
