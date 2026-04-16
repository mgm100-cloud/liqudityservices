create table if not exists federal_contracts (
  id bigint generated always as identity primary key,
  award_id text unique not null,
  recipient_name text not null,
  award_amount real,
  total_obligation real,
  awarding_agency text,
  funding_agency text,
  award_type text,
  start_date text,
  end_date text,
  description text,
  place_of_performance_state text,
  naics_code text,
  first_seen_date text not null,
  created_at timestamptz default now()
);

alter table federal_contracts enable row level security;
create policy "Public read access" on federal_contracts for select using (true);

create table if not exists contract_snapshots (
  id bigint generated always as identity primary key,
  date text not null,
  total_active_contracts integer,
  total_obligated_amount real,
  new_contracts_last_30d integer,
  new_obligation_last_30d real,
  top_agencies jsonb,
  created_at timestamptz default now()
);

alter table contract_snapshots enable row level security;
create policy "Public read access" on contract_snapshots for select using (true);
