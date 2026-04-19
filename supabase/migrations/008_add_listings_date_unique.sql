-- Enforce one row per date in listings.
-- Drops any existing duplicates first (keeping the most recent per date),
-- then adds a unique constraint on date.

delete from listings
where id not in (
  select id from (
    select distinct on (date) id
    from listings
    order by date, timestamp desc, created_at desc, id desc
  ) as keep
);

alter table listings add constraint listings_date_unique unique (date);
