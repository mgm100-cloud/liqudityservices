-- Dedupe and enforce uniqueness on tables that were being re-inserted on every
-- cron run. For each table: delete duplicates (keep latest by created_at/id),
-- then add a unique constraint so future upserts are safe.

-- 1. marketplace_sellers: one row per (date, platform, account_id)
delete from marketplace_sellers
where id not in (
  select id from (
    select distinct on (date, platform, account_id) id
    from marketplace_sellers
    order by date, platform, account_id, created_at desc, id desc
  ) as keep
);

alter table marketplace_sellers
  add constraint marketplace_sellers_date_platform_account_unique
  unique (date, platform, account_id);

-- 2. marketplace_metrics: one row per (date, platform)
delete from marketplace_metrics
where id not in (
  select id from (
    select distinct on (date, platform) id
    from marketplace_metrics
    order by date, platform, timestamp desc, created_at desc, id desc
  ) as keep
);

alter table marketplace_metrics
  add constraint marketplace_metrics_date_platform_unique
  unique (date, platform);

-- 3. contract_snapshots: one row per date
delete from contract_snapshots
where id not in (
  select id from (
    select distinct on (date) id
    from contract_snapshots
    order by date, created_at desc, id desc
  ) as keep
);

alter table contract_snapshots
  add constraint contract_snapshots_date_unique
  unique (date);
