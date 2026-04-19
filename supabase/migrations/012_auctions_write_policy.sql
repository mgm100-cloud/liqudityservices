-- Allow the anon role (used by the Next.js app) to insert/update auctions.
-- Other tables in this project write via the same client; they either have
-- RLS disabled in the Supabase dashboard or had equivalent write policies
-- added outside these migration files. This migration explicitly grants the
-- required access on the auctions table so the cron job can populate it.

create policy "Allow anon insert" on auctions
  for insert
  with check (true);

create policy "Allow anon update" on auctions
  for update
  using (true)
  with check (true);
