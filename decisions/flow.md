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

## 18. The booking commit is a single database function

**Decision.** `book_stay(...)` is a plpgsql function. The API calls it once. All
fifteen checks, the reservation, the calendar update and the ledger line happen
inside it.

**Why.** It has to be all-or-nothing. Supabase's REST interface has no
transactions across calls, so doing this as six HTTP requests means a crash
midway leaves the database lying: a villa held for a reservation that does not
exist, or an allowance spent for a stay nobody has. One function is one
transaction — any exception rolls back everything.

It is `SECURITY DEFINER` and resolves the member from `auth.uid()` rather than
accepting a member id. A caller therefore cannot book on someone else's behalf
or spend another member's allowance, even by calling the function directly.

**Cost.** Business logic lives in SQL, which is harder to unit-test and to read
for a TypeScript developer. The tradeoff is deliberate: correctness under
concurrency matters more here than developer familiarity.

---

## 19. Three independent guards against double-booking

**Decision.** Selecting a free unit, the exclusion constraint, and a row-count
check on the calendar update.

**Why.** The `SELECT` finds a unit free on every night. Between that read and the
write, another transaction may take it. The exclusion constraint on
`reservation_items` then rejects the overlap. Finally the `UPDATE availability`
counts the rows it changed and aborts if it is not exactly the number of nights,
catching anything that slipped through.

The API maps the resulting Postgres codes — `23P01` exclusion violation and
`40001` serialization failure — to a plain 409 "those dates were just taken".
A constraint violation here is an expected outcome, not a crash.

**Cost.** Some redundancy. That is the point.

---

## 20. Onboarding is a function, not a script

**Decision.** `admin_onboard_member(user_id, plan_id)` creates the member,
contract, entitlement **and the opening ledger line** together.

**Why.** Creating a member is four related writes, and the easiest to forget is
the ledger line. Balances are summed from the ledger and never stored, so a
member created without one has an allowance of zero and cannot book — with no
obvious cause. Wrapping it means it cannot be half-done.

Written now because the booking engine needed a real member to test against, but
it is the same function the admin "onboard member" screen will call. Test
scaffolding and production code are the same path.

**Cost.** None meaningful. It permits the service role (where `auth.uid()` is
null) so it can be called before any admin UI exists.

---

## 21. Ledger lines point back at their reservation

**Decision.** `entitlement_ledger` and `points_ledger` carry a `reservation_id`.

**Why.** The clean-start baseline dropped this column, and the booking function
failed on it. The fix could have been to stop writing it — but then a member sees
that 3 nights left their balance with no way to know which booking took them,
which defeats the purpose of keeping a ledger at all. The column went back in.

The same pass restored read policies on both ledgers, which the baseline had left
with RLS enabled and no policy — the third occurrence of that gap.

**Cost.** None. The reference was always implied; now it is stored.

---

## 22. Verify function code against the live schema, not against memory

**Decision.** Before running a migration, diff every column the code writes
against PostgREST's OpenAPI spec, which lists the real columns of every table.

**Why.** Two bugs in a row came from writing SQL against the *archived* schema
rather than the live one: `RETURNS TABLE` name collisions, then a missing
`reservation_id`. SQL has no compiler to catch this, and the errors only appear
at execution. One diff found every remaining mismatch at once instead of a
fix-run-fail loop.

**Cost.** An extra check before each schema-touching change. Cheap.

---

## 23. Admin writes go straight to Supabase, not through the API

**Decision.** The admin screens insert and update `resorts`, `room_types` and
`resort_units` directly with the browser client.

**Why.** RLS already restricts these tables to holders of `inventory.write`. A
server hop would re-check the same thing the database is already enforcing and
add a place for the two checks to disagree. The backend is reserved for what the
browser genuinely cannot be trusted with: secrets and atomic transactions.

**Cost.** Two write paths in the codebase. The rule is: if the database can
enforce it, write directly; if it needs a secret or a transaction, use the API.

---

## 24. New units get their calendar from a trigger

**Decision.** An `AFTER INSERT` trigger on `resort_units` generates 12 months of
availability rows.

**Why.** A unit with no availability rows can never be booked, and nothing about
the admin screen explains why. Making the database do it means a villa is
bookable the moment it exists. The units table also shows a red "nights open: 0"
so the broken state is visible rather than mysterious.

**Cost.** Fixed 12-month horizon. `extend_availability(resort, through)` pushes
it further out when needed.

---

## 25. The first super admin must be created by hand

**Decision.** `admin_set_role` requires the caller to already be a super admin,
so the first one is inserted with SQL.

**Why.** Any bootstrap that works without an existing admin is a privilege
escalation path. The function also refuses to remove the last super admin, which
would lock everyone out of the platform permanently.

**Cost.** One manual SQL statement per environment, documented in the migration.

---

## 26. Logins are recorded by the server, and never block sign-in

**Decision.** After a successful sign-in the browser calls
`POST /api/account/login-event`, which writes the row using the service role.
The call is fire-and-forget.

**Why.** IP address and user agent must come from the request, not from the
client, or the audit trail records whatever the caller claims. `login_sessions`
also grants only SELECT to authenticated users, so the insert needs the service
role — exactly the kind of privileged write the API exists for.

It is fire-and-forget because an analytics write must never stop someone logging
in. If the API is down, the user still gets in and the row is simply missing.

**Cost.** Sign-ins that happen while the API is unreachable go unrecorded. That
is the right trade: losing a statistic beats locking out a customer.

---

## 27. Login history is joined in the application, not the database

**Decision.** The analytics screen fetches `login_sessions`, then fetches the
matching profiles and joins them in JavaScript.

**Why.** `login_sessions.user_id` references `auth.users`, not `public.profiles`.
PostgREST can only embed across a real foreign key, so asking for
`profiles(full_name, email)` returns 400. The alternative — adding an FK to
`profiles` — would duplicate a relationship auth already owns.

**Cost.** Two queries instead of one, capped at 200 recent sign-ins.

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
