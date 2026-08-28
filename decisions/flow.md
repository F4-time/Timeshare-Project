# Decision log

Why the project is built the way it is. Each entry records the decision, the
reasoning, and what it costs us. Updated as the build progresses.

---

## 1. Two apps, not one

**Decision.** The workspace root holds the original Lovable app as a read-only
design reference. All real work happens in `timeshare-platform/`.

**Why.** The original is TanStack **Start** (server-side rendering with
`createServerFn`). The rebuild is a plain Vite **SPA**. Mixing them would mean
two build systems and two deployment models in one tree.

**Cost.** Anything data-driven in the original cannot be copied directly — it
calls server functions that do not exist in an SPA. Each such page has to be
re-implemented against Supabase or the new API.

---

## 2. The rebuild is a client-side SPA

**Decision.** Vite + React + TanStack Router, no SSR.

**Why.** Simple to build, simple to host as static files, and the portal is
behind a login where SEO does not matter.

**Cost.** Public marketing pages lose server-rendered HTML. Meta tags are set
client-side via `HeadContent`; React 19 hoists them into `<head>`, which works
for most crawlers but is weaker than true SSR. Revisit if organic search
becomes important.

---

## 3. Row Level Security is the primary access boundary

**Decision.** Every table has RLS enabled. The browser talks to Supabase
directly for anything a user is allowed to read.

**Why.** The check lives next to the data. Even if the frontend has a bug, or
someone calls the REST API directly with a stolen anon key, Postgres still
refuses rows that are not theirs. Defence does not depend on application code
being correct.

**Cost.** Policies must be written for every table, and RLS is deny-by-default
— a table with RLS on and *no* policy is invisible to everyone, including its
owner. This bit us once (see entry 12) and is now a checklist item.

---

## 4. `useAccount` queries Supabase from the browser

**Decision.** The signed-in user's profile, roles, member and owner records are
fetched client-side rather than through the API.

**Why.** `profiles`, `user_roles`, `members` and `owners` all have self-read
policies (`user_id = auth.uid()`). The database already guarantees a user sees
only their own row, so routing this through a server adds a hop and no safety.

**Cost.** None for reads. Writes and anything privileged still go server-side.

---

## 5. Unbuilt navigation renders as greyed-out "Soon", not links

**Decision.** Portal sidebars list the full roadmap, but items without a route
are non-clickable and labelled "Soon".

**Why.** Dead links that 404 feel broken. Hiding them entirely hides the
product's shape. This is honest about what exists.

**Cost.** Slightly more markup in `PortalShell`.

---

## 6. A separate backend is required

**Decision.** `timeshare-platform/backend`, Express 5 + TypeScript.

**Why.** Three things cannot happen in a browser:
- **Razorpay** order creation and webhook signature verification need the secret
  key. Shipping it to the client would let anyone forge payments.
- **The booking commit** must be atomic: check eligibility, lock inventory, hold
  entitlement, capture payment. A client can be paused, replayed or modified.
- **Privileged writes** (login tracking, admin operations) need `service_role`,
  which bypasses RLS and must never leave the server.

**Cost.** A second app to run, deploy and keep in sync.

---

## 7. Express over NestJS

**Decision.** Plain Express with small, explicit modules.

**Why.** The API surface is mostly thin handlers over Postgres. Nest's modules,
decorators and DI would add ceremony without solving a problem we have.

**Cost.** No opinionated structure enforced by the framework, so conventions have
to be maintained by discipline.

---

## 8. Two Supabase clients on the server, used deliberately

**Decision.** `supabaseAdmin` uses `service_role` and bypasses RLS.
`supabaseForUser(jwt)` pairs the **anon** key with the caller's JWT so RLS still
applies. User-scoped reads use the latter.

**Why.** If every server query ran as `service_role`, one missing `.eq('user_id',
...)` would leak the whole table. Running as the user keeps the database's
guarantees in force even when the handler is wrong.

**Cost.** Two clients to reason about. The rule is: `supabaseAdmin` only after
authorization has been established, never to fetch "the current user's" data.

*Correction:* this was first written using the service key for both. That would
have silently disabled row security on every user query. Fixed before shipping.

---

## 9. Members cannot INSERT reservations

**Decision.** `reservations` has a SELECT policy for your own bookings and no
member-level INSERT policy. Only `bookings.write` permission — i.e. the server
— can create them.

**Why.** A client that can write its own reservation row can grant itself a free
holiday: pick any dates, set `points_used = 0`, skip the fee check.

**Cost.** All booking traffic must go through the API. There is no "quick"
client-side write path, by design.

---

## 10. Double-booking is prevented by the database

**Decision.** `reservation_items` carries a GiST exclusion constraint:
`EXCLUDE USING gist (resort_unit_id WITH =, stay_range WITH &&) WHERE (is_active)`.

**Why.** Two concurrent requests can both read "unit is free" before either
writes. Application-level checks cannot close that window; a database constraint
can. The second transaction fails instead of selling the same villa twice.

**Cost.** Requires the `btree_gist` extension, and the API must handle the
constraint violation as a real, expected outcome rather than a crash.

---

## 11. Per-unit inventory, not a nightly count

**Decision.** `resort_units` are individual physical villas; `availability`
holds one row per unit per night.

**Why.** Timeshare ownership is tied to specific things — "you own unit 302,
week 12". A bare count per room type cannot express owner allocation, cannot
support the exclusion constraint above, and cannot answer "which unit is this
guest in".

**Cost.** Volume. One year of demo inventory is already 17,568 rows
(48 units × 366 nights). Real portfolios will need partitioning or pruning.

---

## 12. Booking rules promoted to real columns

**Decision.** `membership_plans` keeps `benefits` jsonb for display, but
`entitlement_kind`, `booking_window_days`, `resort_scope`, `min_stay_nights` and
`max_stay_nights` are proper columns.

**Why.** The booking engine filters and compares on these. Reading them out of a
jsonb blob means no indexes, no type checking, and silent failure when a key is
missing or misspelled.

**Cost.** Two places describe a plan. The jsonb is presentation; the columns are
truth. Values were backfilled from the jsonb so nothing broke.

---

## 13. Database is the single source of truth for catalogues

**Decision.** Deleted the static `src/data/plans.ts` once `/membership` read
from Postgres.

**Why.** Two definitions of the same plans will drift, and the one that is not
rendered drifts silently.

**Cost.** The page now depends on the database being reachable and seeded. It
shows an honest empty state if not.

---

## 14. Resort images are still bundled locally

**Decision.** Images are imported into the frontend and matched to a resort by
`slug`, with a generic fallback. `resorts.image_url` is unused for now.

**Why.** Bundled images are optimised and cached by the build. There is no
upload UI or storage bucket yet.

**Cost.** A resort added through a future admin screen gets the generic image
until `image_url` is populated. Needs Supabase Storage when admin CRUD lands.

---

## 15. Migrations were reset, and the old ones archived

**Decision.** `MIGRATION_READY_CLEAN.sql` is the baseline. The 19 original
Lovable migrations moved to `_archive_lovable/`, kept for reference only.

**Why.** The clean file dropped and recreated the schema. The old migrations
describe a different, larger shape and would conflict if run.

**Cost.** The clean start also dropped booking and inventory, which had to be
rebuilt (entry 11). The archived files were the reference for doing so.

---

## 16. Secrets are never committed

**Decision.** `.env` is gitignored in both apps; only `.env.example` with empty
values is tracked. The Lovable app was removed from the repo *and* from history
by rewriting the initial commit.

**Why.** The first `git add -A` would have published live Supabase credentials.
Deleting a file in a later commit does not remove it from history.

**Cost.** Anyone cloning must create their own `.env`. Documented in the README.

---

## 17. Availability search is a public endpoint running as `service_role`

**Decision.** `GET /api/availability/search` needs no login, but internally reads
inventory with the service role and returns only a computed result: room type,
how many units are free, and the price.

**Why.** Browsing availability before signing up is normal for a holiday site.
But `resort_units` and `availability` are staff-only under RLS, and should stay
that way — a visitor has no business enumerating villa numbers or seeing the
occupancy of the whole portfolio. Computing server-side gives the guest what
they need and nothing else.

**Cost.** The handler must be careful: it runs with RLS bypassed, so every filter
is its own responsibility. Input is validated with zod before any query runs.

**Details worth remembering.** The check-out day is not a night, so a 7th→10th
stay is 3 nights. Seasons are inclusive on both ends, and any night outside every
season prices at 1.0×. Stays are capped at 30 nights to bound the query.

---

## Open questions

- **Entitlement holds need a timeout.** The spec allows a 15-minute hold during
  payment. Nothing releases an abandoned hold yet — needs a scheduled job.
- **Availability volume.** Generating a year per unit does not scale to a real
  portfolio. Likely needs date-range storage or partitioning.
- **`payments` table is a leftover** from the pre-reset schema and does not match
  the current design. Needs reconciling before payments work starts.
- **Email confirmation is currently disabled** on the live project so testing
  could proceed. Must be re-enabled before real users sign up.
