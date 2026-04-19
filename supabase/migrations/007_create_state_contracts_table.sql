create table if not exists state_contracts (
  id bigint generated always as identity primary key,
  state_code text not null,
  source_portal text not null,
  source_dataset_id text not null,
  contract_id text not null default '',
  vendor_name text not null,
  vendor_normalized text not null,
  customer_agency text not null default '',
  contract_title text,
  amount numeric,
  year text not null default '',
  quarter text not null default '',
  period_start date,
  period_end date,
  raw_data jsonb,
  first_seen_date text not null,
  created_at timestamptz default now(),
  constraint state_contracts_uniq unique (state_code, source_dataset_id, contract_id, vendor_normalized, year, quarter, customer_agency)
);

alter table state_contracts enable row level security;
create policy "Public read access" on state_contracts for select using (true);

create index if not exists idx_state_contracts_state on state_contracts (state_code, first_seen_date desc);
create index if not exists idx_state_contracts_vendor on state_contracts (vendor_normalized, year desc);
