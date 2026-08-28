# Forever Timeshare — remaining build prompt

Hand this to whoever (or whatever) picks up the build next. It contains the
context, the rules that must not be broken, what is already done, and the
remaining work split into phases.

**Work one phase at a time. Do not attempt several phases in a single pass.**
Each phase ends with a verification step. Do not start the next phase until the
current one is verified against the live database.

---

## 1. What this project is

A timeshare / shared-ownership platform. Members buy a plan giving them a yearly
allowance (either **nights** or **points**) and book stays at resorts. Owners own
specific units or weeks and can use, rent or exchange them. Staff administer the
whole portfolio.

Plain-English explanation of the domain: `decisions/project-explained.md`
Every design decision and why: `decisions/flow.md`
Original full spec: `docs/MASTER-BUILD-SPEC.md`

Read all three before writing code. `flow.md` in particular records mistakes
already made and paid for — repeating them wastes time.

---

## 2. Stack and layout

```
timeshare-platform/
  frontend/   Vite + React 19 + TypeScript, TanStack Router (SPA), Tailwind v4, shadcn/ui
  backend/    Express 5 + TypeScript REST API
supabase/
  migrations/           applied in filename order
  migrations/_archive_lovable/   historical only — DO NOT RUN
decisions/    living documentation, keep updated
```

The repository root also contains the original Lovable app (`src/`, `public/`,
root `package.json`). It is **gitignored and read-only** — a design reference
only. Never edit it, never import from it.

### Running it

```bash
cd timeshare-platform/frontend && npm install && npm run dev   # :5173
cd timeshare-platform/backend  && npm install && npm run dev   # :3000
```

Both need a `.env` (copy from `.env.example`). Values come from the Supabase
project. The frontend needs the URL + publishable key; the backend additionally
needs the **service role key**, which must never reach the browser.

Live Supabase project: `czsndimpcqthejahuown`.
Note `supabase/config.toml` may still reference an older project — the live one
is the value in the root `.env`'s `VITE_SUPABASE_URL`.

---

## 3. Rules that must not be broken

These are not style preferences. Each one exists because breaking it causes a
real defect.

1. **Every table has RLS enabled, and every table gets its policies in the same
   migration.** RLS with no policy denies all access, including to the owner.
   This has already silently broken six tables twice.

2. **Balances come from the ledger, never from a stored column.**
   `entitlements.total_units` is what was granted. The balance is
   `entitlement_balance(entitlement_id)`, which sums the ledger. Spending is a
   negative ledger line; refunding is a positive one. Never overwrite a balance.

3. **Members cannot INSERT reservations.** There is deliberately no INSERT policy
   for them. Bookings go through `book_stay()`, which re-checks eligibility. A
   client that can write its own reservation can grant itself a free holiday.

4. **Anything that must be atomic goes in a plpgsql function.** Supabase REST has
   no transaction across calls. The booking commit is one function so a failure
   halfway cannot leave a villa held for a reservation that does not exist.

5. **plpgsql functions return `jsonb`, not `RETURNS TABLE`.** Output column names
   collide with real column names and raise `42702 column reference is
   ambiguous`. This has already cost one failed migration.

6. **`supabaseAdmin` (service role) bypasses RLS.** Use it only after
   authorization is established. For anything on behalf of a user, use
   `supabaseForUser(jwt)`, which pairs the anon key with their token so RLS still
   applies.

7. **Write directly to Supabase from the browser when RLS can enforce the rule.**
   Use the backend only for secrets (Razorpay), atomic transactions (booking), or
   service-role writes (login tracking). Do not proxy reads the database already
   protects.

8. **Never commit `.env`.** Only `.env.example` with empty values.

9. **Do not convert query errors into default values.** `supabase-js` returns
   `{data, error}` and does **not** throw. A `try/catch` wrapper that returns `0`
   will hide a broken query as a confident wrong number. Check `error`
   explicitly. This produced a dashboard that displayed a false balance.

---

## 4. Known environment traps

- **The TanStack Router plugin overwrites new route files with a scaffold stub**
  while the dev server is watching. Stop the dev server, create the file, then
  restart. Verify the file size afterwards.
- **`routeTree.gen.ts` only regenerates when the dev server runs.**
  `npx tsr generate` fails silently. After adding a route, run `npm run dev` once
  before `npm run build`.
- **PowerShell's `Invoke-RestMethod` swallows HTTP error bodies.** Use
  `curl.exe -s -w "%{http_code}"` to see real API and Postgres errors. Two bugs
  looked like empty failures because of this.
- **PostgREST returns 404 when RPC arguments do not match a signature.** That does
  not mean the function is missing. Probe with real arguments.
- **Before writing SQL against a table, check the live schema.**
  `GET /rest/v1/` returns an OpenAPI spec listing every column
  (`$spec.definitions.<table>.properties`). The archived migrations describe a
  *different* schema; writing from them caused two failed migrations.

---

## 5. Current state

### Working and verified against the live database

| Area | Notes |
| --- | --- |
| Public site | Home, resorts, membership, offers, about, how-it-works, FAQ, contact |
| Auth | Register, sign in, reset, route guard, role-based routing |
| Roles | MEMBER / OWNER / RESORT_STAFF / ADMIN_STAFF / SUPER_ADMIN |
| Catalogue | Resorts and plans read live from the database |
| Booking engine | `book_stay`, `cancel_reservation`, availability search |
| Concurrency | 8 simultaneous requests on 4 units → exactly 4 booked, none oversold |
| Member portal | Dashboard, search & book, my bookings with cancel |
| Admin portal | Dashboard, analytics, resorts CRUD, room types, bulk unit creation |
| Login tracking | Recorded server-side with IP and user agent |
| API | `/health`, `/api/account/me`, `/api/account/login-event`, `/api/availability/search`, `/api/bookings` (POST/GET), `/api/bookings/:id/cancel` |

### Key database objects

Functions: `book_stay`, `cancel_reservation`, `admin_onboard_member`,
`admin_set_role`, `entitlement_balance`, `extend_availability`,
`current_member_id`, `current_owner_id`, `can_see_reservation`,
`has_role`, `has_permission`, `is_super_admin`, `staff_can_access_resort`

Trigger: new `resort_units` rows automatically get 12 months of availability.

### Not built

Payments · maintenance fee billing · the entire owner side (no tables) ·
member membership/profile/documents/support pages · most admin screens ·
notifications · documents storage · audit triggers · reports · automated tests ·
deployment.

### Outstanding issues to fix at some point

- `member_documents` and `member_family` tables do not exist; the dashboard logs
  404s and shows "Documents: 0".
- The `payments` table is a leftover from the pre-reset schema and does not match
  the current design. Reconcile before starting payments work.
- Entitlement holds have no timeout. An abandoned booking holds inventory
  forever. Needs a scheduled release job.
- `availability` is one row per unit per night — 17.5k rows for a year of demo
  data. Will not scale to a real portfolio without partitioning or date ranges.
- Email confirmation is currently **disabled** on the live Supabase project so
  testing could proceed. Re-enable before real users sign up.
- Test accounts exist (`portal.tester.*@gmail.com`, `admin.tester@gmail.com`,
  `probe.*@gmail.com`). Delete them before launch.

---

## 6. The phases

Do these in order. Later phases depend on earlier ones.

---

### Phase 1 — Admin: members and contracts

**Why first.** The business currently cannot onboard a customer without a
developer running SQL. Everything else is less urgent than that.

Build:
- `/admin/members` — list of profiles with roles, member code, status, search.
- Onboard flow — pick a user, pick a plan, call the existing
  `admin_onboard_member(user_id, plan_id)` RPC. The function already creates the
  member, contract, entitlement and opening ledger line.
- `/admin/members/$id` — their contract, entitlement balance, ledger history and
  bookings.
- Role management using the existing `admin_set_role` RPC.

Do not write new SQL for onboarding — the function exists and is tested.

**Done when:** a brand-new signup can be onboarded onto a plan entirely through
the UI, and immediately books a stay successfully.

---

### Phase 2 — Payments (Razorpay)

Depends on Phase 1.

- Reconcile or drop the leftover `payments` table; write a migration matching the
  current design (`payments`, `payment_transactions`, `invoices`, `refunds`).
- Backend: create a Razorpay order — **recompute the amount server-side**, never
  trust an amount sent by the client.
- Webhook at `POST /api/public/webhooks/razorpay`. Verify
  `X-Razorpay-Signature` with HMAC-SHA256 against the raw body. This route needs
  the raw body, so mount it **before** `express.json()`.
- On capture, move the reservation from `pending` to `confirmed` and convert the
  entitlement hold into a spend.
- On failure or timeout, release the hold and return the inventory.

**Security note:** the webhook is unauthenticated by definition. The signature
check is the only thing standing between a stranger and a free confirmed
booking. Reject anything that fails it, and make the check constant-time.

**Done when:** a test-mode payment moves a reservation to `confirmed`, and a
forged webhook is rejected.

---

### Phase 3 — Entitlement hold timeout

Small but important, and it makes Phase 2 safe.

- A hold placed during checkout must expire (spec says 15 minutes).
- Add a scheduled job (Supabase cron or a backend interval) that releases
  reservations still `pending` past the window: restore availability, write a
  positive ledger line, mark the reservation cancelled.

**Done when:** an abandoned booking returns its villa and allowance
automatically.

---

### Phase 4 — Owner engine (schema)

The largest untouched area. **Schema only in this phase — no UI.**

Create with full RLS policies:
`ownership_contracts`, `ownership_units`, `ownership_weeks`, `ownership_points`,
`rental_listings`, `rental_bookings`, `rental_payouts`, `exchange_requests`,
`exchange_transactions`.

Model on `supabase/migrations/_archive_lovable/` — it models this correctly — but
**check every column against the live schema before using it**, because the
archived schema differs from what is deployed.

Owners already have `entitlements` support (`entitlements.owner_id` exists), so
reuse the same ledger mechanism rather than inventing a parallel one.

**Done when:** an owner can be given a contract and entitlement by SQL, and
`book_stay` works for them. Extend `book_stay` to resolve an owner contract when
the caller is an owner rather than a member.

---

### Phase 5 — Owner portal

Depends on Phase 4.

`/owner/dashboard`, `ownership`, `use` (use / guest / rent / exchange chooser),
`rentals`, `exchange`, `earnings`, `payments`, `documents`, `profile`.

Renting and exchanging move entitlement between parties — every movement is a
ledger line. Do not shortcut this.

---

### Phase 6 — Member portal completion

- Migration for `member_documents` and `member_family` (with RLS). This also
  clears the existing 404s.
- `/member/membership` — plan, contract, entitlement balance, ledger history.
- `/member/payments` — fees and payment history (after Phase 2).
- `/member/documents` — Supabase Storage, private bucket, signed URLs.
- `/member/profile` — profile and family members.
- `/member/support` — tickets (`support_tickets`, `ticket_messages`).

---

### Phase 7 — Admin portal completion

`bookings` · `calendar` (block / release / maintenance / owner allocation) ·
`plans` CRUD · `contracts` · `owners` · `maintenance` · `payments and refunds` ·
`rentals` · `exchange` · `documents` · `tickets` · `staff` · `roles` ·
`settings` · `audit`.

Roughly 15 screens. Build them a few at a time and verify each.

Also add **resort images**: currently images are bundled in the frontend and
matched by slug. Wire `resorts.image_url` to Supabase Storage so a resort added
through the UI can have its own photo.

---

### Phase 8 — Audit triggers

Stage 04 of the original spec was never finished. `audit_logs` exists but nothing
writes to it.

Add triggers capturing actor, timestamp, before and after on every
administrative mutation. Ledger and audit tables are insert-only — no update or
delete policy.

---

### Phase 9 — Notifications and documents

In-app `notifications` table plus email. Booking confirmations, cancellations,
fee reminders. Generate confirmation and invoice documents into Storage.

---

### Phase 10 — Reports

Extend the existing analytics page: occupancy, revenue, entitlement utilisation,
maintenance fee collection, per-resort performance. Date-range filters and CSV
export.

---

### Phase 11 — Hardening

- Rate limiting on auth and booking endpoints.
- `helmet` is present; review CSP.
- Set `trust proxy` on the backend so client IPs are correct behind a load
  balancer (login tracking currently records `::1` locally).
- Review every RLS policy against the role matrix in the spec.
- Confirm no `service_role` usage where a user-scoped client would do.
- Re-enable email confirmation. Delete test accounts.
- Consider the availability volume problem before onboarding a real portfolio.

---

### Phase 12 — Automated tests

There are currently **no automated tests**. Everything so far was verified by
hand against the live database.

Priorities, highest value first:
1. `book_stay` — every rejection path, and the concurrency guarantee.
2. `cancel_reservation` — allowance restored, availability released.
3. RLS — a member cannot read another member's rows. Test with real JWTs.
4. Availability search — season pricing, capacity filters, blackouts.
5. Webhook signature verification.

Use a separate Supabase project or a local instance. Do not run destructive tests
against the live database.

---

### Phase 13 — Deployment

Frontend as static files (Vercel / Netlify / S3). Backend as a Node service
(Railway / Fly / ECS). Set env vars in each. Point the Razorpay webhook at the
deployed URL and switch to live keys. Verify CORS `ALLOWED_ORIGIN` matches the
deployed frontend.

---

## 7. How to work

For every phase:

1. **Read** `decisions/flow.md` first. It explains why things are as they are.
2. **Check the live schema** before writing SQL. Do not trust the archived
   migrations or memory.
3. **One migration per phase** where possible, and always include RLS policies.
4. **Verify against the live database**, not just the type checker. A green build
   proves nothing about whether a query returns the right rows.
5. **Test the failure paths**, not only the happy one. Several bugs here appeared
   only when something was refused.
6. **Update `decisions/flow.md` and `decisions/project-explained.md`** with what
   you decided and why, including anything that turned out to be wrong.
7. **Commit and push per phase**, not per file.

A note on verification, learned the hard way here: a test that passes while
testing the wrong thing is worse than a failing test. One concurrency test
appeared to pass but had hit an unrelated limit before ever reaching the
condition it was meant to prove. Check that a passing test could actually have
failed.
