-- Admin-only "resort owner" contact details (the person/party who owns the physical
-- resort/villa property), distinct from the pre-existing public.owners table (which
-- represents timeshare UNIT/points owners, not property owners). Surfaced on a new
-- admin "Owners" tab alongside the resort's address and live room-booking status.
-- Nullable: existing resorts have no owner on file yet, and the admin resort form
-- treats these as optional fields.
ALTER TABLE public.resorts
  ADD COLUMN IF NOT EXISTS owner_name text,
  ADD COLUMN IF NOT EXISTS owner_phone text,
  ADD COLUMN IF NOT EXISTS owner_email text;

-- Resort writes (INSERT/UPDATE/DELETE) already require the 'inventory.write'
-- permission via resorts_write_admin (20260828120000_fix_rls_and_seed_catalogues.sql),
-- so only admin/staff can set or change these owner fields — no new policy needed.
