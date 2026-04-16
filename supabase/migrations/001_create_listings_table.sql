create table if not exists listings (
  id bigint generated always as identity primary key,
  date text not null,
  timestamp text not null,
  allsurplus integer,
  govdeals integer,
  created_at timestamptz default now()
);

-- Allow public read access for the dashboard
alter table listings enable row level security;

create policy "Allow public read" on listings
  for select using (true);

-- Index for chronological queries
create index idx_listings_date on listings (date desc, timestamp desc);
