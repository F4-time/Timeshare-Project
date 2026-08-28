# Forever Timeshare

A shared-ownership (timeshare) platform: public marketing site, member/owner/admin
portals, and the Supabase schema behind them.

```
timeshare-platform/
  frontend/   Vite + React 19 + TypeScript, TanStack Router SPA, Tailwind v4, shadcn/ui
  backend/    Express 5 + TypeScript REST API (Supabase service-role operations)
supabase/
  migrations/ Database schema, RLS policies and seed data
docs/         Architecture notes and the master build spec
```

## Getting started

Both apps need their own `.env`. Copy the examples and fill in the values from
your Supabase project (Project Settings → API).

```bash
# Frontend — http://localhost:5173
cd timeshare-platform/frontend
cp .env.example .env        # VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY
npm install
npm run dev

# Backend — http://localhost:3000
cd timeshare-platform/backend
cp .env.example .env        # SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
npm install
npm run dev
```

Apply the migrations in `supabase/migrations/` in filename order, via the
Supabase SQL editor or the CLI. `_archive_lovable/` is historical only — do not
run it.

## Architecture

The frontend reads **public, anon-readable data directly from Supabase** (resorts,
membership plans) and **user-owned data under RLS** (profile, roles, entitlements).
Row Level Security is the primary access boundary: a signed-in user can only ever
read their own rows.

The backend exists for work the browser must not do:

- Razorpay order creation and webhook signature verification (secret key)
- The booking commit — inventory lock, entitlement hold, payment capture — which
  must be atomic and server-enforced
- Privileged writes needing the `service_role` key

`supabaseAdmin` bypasses RLS and is only used after authorization. User-scoped
queries go through `supabaseForUser(jwt)`, which pairs the anon key with the
caller's JWT so RLS still applies.

## Status

| Area | State |
| --- | --- |
| Design system, layout, responsive chrome | Done |
| Public pages (home, resorts, membership, offers, about, how-it-works, FAQ, contact) | Done |
| Auth — register, sign in, reset, route guard, role routing | Done |
| Member / Owner / Admin portal shells + dashboards | Done |
| Resorts + membership plans reading from the database | Done |
| Backend scaffold — env validation, JWT auth, role checks, `/api/account/me` | Done |
| Booking + inventory schema (`room_types`, `availability`, `reservations`) | Not started |
| Booking engine, payments, maintenance fees | Not started |
| Portal sub-pages (bookings, documents, profile, admin CRUD) | Not started |
| Resort detail page `/resorts/$slug` | Blocked on inventory schema |

## Security notes

- `.env` files are gitignored; never commit credentials.
- The `service_role` key must stay server-side. It is not present in the frontend.
- Every table has RLS enabled. When adding a table, add its policies in the same
  migration — RLS with no policy denies all access, including to the owner.
