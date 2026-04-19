-- Auction-level tracking for revenue forecasting.
-- Unlike marketplace_metrics (point-in-time aggregate over a 50-row sample),
-- this table tracks individual auctions across their lifecycle so we can
-- compute realized GMV, close rate, and forward revenue projections.

create table if not exists auctions (
  id bigint generated always as identity primary key,
  platform text not null check (platform in ('AD', 'GD')),
  asset_id text not null,
  seller_account_id text,
  seller_company text,
  category text,
  currency_code text,
  current_bid_usd real,
  bid_count integer,
  close_time_utc timestamptz,
  status text not null default 'open' check (status in ('open', 'closed_sold', 'closed_nosale', 'unknown')),
  final_price_usd real,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  closed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table auctions enable row level security;
create policy "Public read access" on auctions for select using (true);

create unique index if not exists auctions_platform_asset_unique
  on auctions (platform, asset_id);

create index if not exists auctions_close_time
  on auctions (close_time_utc)
  where status = 'open';

create index if not exists auctions_status_close_time
  on auctions (status, close_time_utc desc);

create index if not exists auctions_seller
  on auctions (seller_account_id, platform);

create index if not exists auctions_category
  on auctions (category);

-- Daily rollups derived from auctions. Recomputed as a view so we always
-- see fresh numbers after a cron run without a second write path.
create or replace view auction_daily_stats as
with close_day as (
  select
    platform,
    (close_time_utc at time zone 'America/New_York')::date as close_date,
    category,
    status,
    final_price_usd,
    current_bid_usd,
    bid_count
  from auctions
  where close_time_utc is not null
)
select
  close_date,
  platform,
  count(*) filter (where status in ('closed_sold', 'closed_nosale')) as auctions_closed,
  count(*) filter (where status = 'closed_sold') as auctions_sold,
  count(*) filter (where status = 'open') as auctions_scheduled_open,
  count(*) as auctions_total,
  coalesce(sum(final_price_usd) filter (where status = 'closed_sold'), 0) as realized_gmv_usd,
  coalesce(avg(final_price_usd) filter (where status = 'closed_sold' and final_price_usd > 0), 0) as avg_hammer_usd,
  coalesce(sum(current_bid_usd) filter (where status = 'open'), 0) as scheduled_open_bid_usd,
  coalesce(sum(bid_count) filter (where status in ('closed_sold', 'closed_nosale')), 0) as total_bids_closed
from close_day
group by close_date, platform;
