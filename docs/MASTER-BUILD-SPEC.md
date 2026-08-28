# Forever Timeshare — Master Build Specification

Single source of truth. `docs/ARCHITECTURE.md` holds the condensed overview;
this document holds the executable detail. Nothing gets built that is not
described here, and anything built differently must be reflected back here.

Status: Stages 01–13 complete (foundation, schema, auth+roles, RLS hardening + audit triggers, membership engine, ownership engine, resort & inventory engine, booking engine, payments + maintenance, member portal, owner portal, admin portal, notifications + documents). Stage 14 (reports & analytics) complete. Stage 15 (production hardening) complete. Stage 16 (testing + bug fixing) complete: anonymous RLS negative tests pass on all private tables, public routes return 200 with no console errors and no mobile overflow, signup triggers verified, server-function modules refactored to thin wrappers (helpers moved to booking-select / inventory-select / ownership-select / audit-filters / owner-helpers so bundling can't drop them), lint + typecheck clean, QA test account removed. Stage 17 (production deployment) complete on the code side: release checklist recorded below; publishing is a user action.

---

## A. Complete Database Schema

Conventions applied to every table:

- `id uuid primary key default gen_random_uuid()`
- `created_at timestamptz not null default now()`, `updated_at timestamptz`
  maintained by a shared `set_updated_at()` trigger
- money stored as `numeric(12,2)`, currency as `text` default `'INR'`
- soft delete only where an audit trail requires it (`archived_at timestamptz`)
- every `public` table: `CREATE TABLE` → `GRANT` → `ENABLE ROW LEVEL SECURITY`
  → policies, in that order, in the same migration
- ledgers are append-only: no `UPDATE`/`DELETE` policies, balances derived

### A.1 Enums

```
app_role            MEMBER | OWNER | RESORT_STAFF | ADMIN_STAFF | SUPER_ADMIN
account_status      pending | active | suspended | closed
contract_status     draft | active | expired | terminated | transferred
entitlement_kind    NIGHTS | WEEK | POINTS
entitlement_status  available | held | consumed | expired | deposited
reservation_status  pending | confirmed | checked_in | completed | cancelled | no_show
inventory_status    available | held | booked | owner_allocated | blocked | maintenance
fee_status          pending | partial | paid | overdue | waived
payment_status      created | authorized | captured | failed | refunded | partially_refunded
payment_purpose     membership | maintenance | booking | rental | exchange | other
listing_status      draft | listed | reserved | completed | withdrawn
exchange_status     requested | approved | matched | fulfilled | rejected | cancelled
document_kind       agreement | invoice | confirmation | statement | kyc | other
ticket_status       open | in_progress | waiting | resolved | closed
```

### A.2 Identity

| Table | Key fields |
| --- | --- |
| `profiles` | `id` = `auth.users.id`, `full_name`, `email`, `phone`, `avatar_url`, `status account_status`, `locale`, `last_login_at` |
| `roles` | `key app_role` unique, `label`, `description` |
| `permissions` | `key` unique (e.g. `resorts.write`), `label`, `group` |
| `role_permissions` | `role_key`, `permission_key`, unique pair |
| `user_roles` | `user_id → auth.users`, `role app_role`, unique `(user_id, role)` |
| `staff` | `user_id`, `employee_code`, `department`, `title`, `active` |
| `staff_resorts` | `staff_id`, `resort_id`, unique pair — resort scope |

Roles never live on `profiles`. All checks go through
`public.has_role(_user_id uuid, _role app_role) returns boolean`
(`security definer`, `set search_path = public`), plus
`public.has_permission(_user_id uuid, _permission text)` and
`public.staff_can_access_resort(_user_id uuid, _resort_id uuid)`.

### A.3 Members

| Table | Key fields |
| --- | --- |
| `members` | `user_id`, `member_code` unique, `status account_status`, `joined_at`, `address` jsonb, `kyc_verified_at` |
| `member_family` | `member_id`, `full_name`, `relation`, `dob`, `is_nominee bool`, `id_proof_url` |
| `member_documents` | `member_id`, `kind document_kind`, `title`, `storage_path`, `issued_at` |

### A.4 Owners

| Table | Key fields |
| --- | --- |
| `owners` | `user_id`, `owner_code` unique, `status account_status`, `payout_details` jsonb |
| `ownership_contracts` | `owner_id`, `contract_number` unique, `resort_id`, `status contract_status`, `start_date`, `end_date` (null = perpetual), `purchase_price`, `maintenance_base_fee`, `terms` jsonb |
| `ownership_units` | `contract_id`, `resort_unit_id`, `share_fraction numeric` |
| `ownership_weeks` | `contract_id`, `week_number int check 1..53`, `season`, `nights int`, `is_floating bool` |
| `ownership_points` | `contract_id`, `points_per_year int`, `anniversary_month int` |

### A.5 Membership plans

| Table | Key fields |
| --- | --- |
| `membership_plans` | `code` unique, `name`, `tier`, `entitlement_kind`, `nights_per_year`, `points_per_year`, `booking_window_days`, `term_years` (null = lifetime), `resort_scope` jsonb (`all` or resort ids), `price`, `maintenance_base_fee`, `active bool`, `rules` jsonb |
| `membership_benefits` | `plan_id`, `label`, `detail`, `sort_order` |
| `membership_contracts` | `member_id`, `plan_id`, `contract_number` unique, `status contract_status`, `start_date`, `end_date`, `price_paid`, `signed_document_id` |

Plans are pure data: nights vs. weeks vs. points, annual vs. lifetime vs.
fixed-term are all expressible without a code change.

### A.6 Inventory

| Table | Key fields |
| --- | --- |
| `resorts` | `slug` unique, `name`, `city`, `state`, `country`, `description`, `hero_image_url`, `gallery` jsonb, `lat`, `lng`, `status`, `check_in_time`, `check_out_time` |
| `buildings` | `resort_id`, `name`, `floors int` |
| `room_types` | `resort_id`, `code`, `name`, `max_adults`, `max_children`, `base_points_per_night`, `base_nightly_fee` |
| `resort_units` | `resort_id`, `building_id`, `room_type_id`, `unit_number`, `floor`, `status`, unique `(resort_id, unit_number)` |
| `resort_amenities` | `resort_id`, `label`, `icon` |
| `availability` | `resort_unit_id`, `stay_date date`, `status inventory_status`, `reservation_id`, `note`, unique `(resort_unit_id, stay_date)` |
| `blackouts` | `resort_id` (nullable), `room_type_id` (nullable), `start_date`, `end_date`, `reason`, `applies_to` (`member`/`owner`/`all`) |
| `seasons` | `resort_id`, `name`, `start_date`, `end_date`, `points_multiplier numeric` |

`availability` is the day-grain source of truth and the concurrency point:
one row per unit per date, locked with `SELECT ... FOR UPDATE`, plus a
`btree_gist` exclusion constraint on `reservation_items(resort_unit_id, daterange)`
so overlapping confirmed stays are impossible at the database level.

### A.7 Entitlement

| Table | Key fields |
| --- | --- |
| `entitlements` | `owner_type` (`member`/`owner`), `member_id`/`owner_id`, `source_contract_id`, `kind entitlement_kind`, `year int`, `total_units numeric`, `status entitlement_status`, `valid_from`, `valid_to` |
| `entitlement_ledger` | append-only: `entitlement_id`, `delta numeric`, `reason` (`grant`/`hold`/`consume`/`release`/`expire`/`deposit`/`adjustment`), `reservation_id`, `actor_id`, `notes` |
| `points_ledger` | append-only: same shape for points balances, `balance_after` computed by view only |

Balance = `sum(delta)` over the ledger. No column is ever overwritten.

### A.8 Booking

| Table | Key fields |
| --- | --- |
| `reservations` | `reference` unique, `booked_by`, `member_id`/`owner_id`, `resort_id`, `status reservation_status`, `check_in`, `check_out`, `nights int`, `adults`, `children`, `points_used`, `nights_used`, `total_fees`, `entitlement_id`, `cancellation_id`, `source` (`member`/`owner`/`rental`/`exchange`/`admin`) |
| `reservation_items` | `reservation_id`, `resort_unit_id`, `room_type_id`, `stay_range daterange`, `points`, `fee` |
| `reservation_guests` | `reservation_id`, `full_name`, `relation`, `is_primary`, `id_proof_url` |
| `cancellations` | `reservation_id`, `requested_by`, `reason`, `policy_applied` jsonb, `refund_amount`, `entitlement_restored numeric`, `status` |

### A.9 Money

| Table | Key fields |
| --- | --- |
| `maintenance_fees` | `member_id`/`owner_id`, `contract_id`, `year int`, `amount`, `due_date`, `grace_days`, `late_fee`, `amount_paid`, `status fee_status`, `blocks_booking bool` |
| `payments` | `payer_id`, `purpose payment_purpose`, `reference_id`, `amount`, `currency`, `status payment_status`, `provider` (`razorpay`), `provider_order_id` |
| `payment_transactions` | append-only: `payment_id`, `provider_payment_id`, `event`, `amount`, `raw_payload` jsonb, `signature_verified bool` |
| `invoices` | `number` unique, `payer_id`, `payment_id`, `line_items` jsonb, `subtotal`, `tax`, `total`, `issued_at`, `pdf_path` |
| `refunds` | `payment_id`, `amount`, `reason`, `provider_refund_id`, `status`, `processed_at` |

### A.10 Marketplace

| Table | Key fields |
| --- | --- |
| `rental_listings` | `owner_id`, `contract_id`, `resort_id`, `resort_unit_id`, `start_date`, `end_date`, `asking_price`, `commission_pct`, `status listing_status` |
| `rental_bookings` | `listing_id`, `renter_id`, `reservation_id`, `amount`, `commission_amount`, `owner_amount`, `status` |
| `rental_payouts` | `owner_id`, `rental_booking_id`, `amount`, `status`, `paid_at`, `utr` |
| `exchange_requests` | `owner_id`/`member_id`, `entitlement_id`, `requested_resort_id`, `date_window` daterange, `status exchange_status` |
| `exchange_inventory` | `deposited_entitlement_id`, `resort_id`, `date_range`, `credits numeric`, `status` |
| `exchange_transactions` | append-only credit ledger: `party_id`, `delta`, `reason`, `request_id` |

### A.11 Platform

| Table | Key fields |
| --- | --- |
| `documents` | `owner_user_id`, `kind document_kind`, `title`, `storage_path`, `related_table`, `related_id` |
| `notifications` | `user_id`, `channel` (`in_app`/`email`), `title`, `body`, `link`, `read_at`, `sent_at` |
| `support_tickets` | `user_id`, `subject`, `body`, `status ticket_status`, `assigned_to`, `resort_id` |
| `ticket_messages` | `ticket_id`, `author_id`, `body`, `attachments` jsonb |
| `audit_logs` | `actor_id`, `action`, `entity_table`, `entity_id`, `before` jsonb, `after` jsonb, `ip`, `user_agent`, `created_at` |
| `system_settings` | `key` unique, `value` jsonb, `description` |

Storage buckets: `member-documents` (private), `owner-documents` (private),
`invoices` (private), `resort-media` (public read).

---

## B. Role / Permission Matrix

| Capability | MEMBER | OWNER | RESORT_STAFF | ADMIN_STAFF | SUPER_ADMIN |
| --- | --- | --- | --- | --- | --- |
| Own profile r/w | ✅ | ✅ | ✅ | ✅ | ✅ |
| Own membership/ownership read | ✅ | ✅ | — | ✅ | ✅ |
| Search availability | ✅ | ✅ | ✅ | ✅ | ✅ |
| Create reservation for self | ✅ | ✅ | — | — | ✅ |
| Create reservation for others | — | — | assigned resort | ✅ | ✅ |
| Cancel own reservation | ✅ | ✅ | — | ✅ | ✅ |
| Rent / exchange entitlement | — | ✅ | — | ✅ | ✅ |
| Manage resort inventory calendar | — | — | assigned resort | ✅ | ✅ |
| Check-in / check-out | — | — | assigned resort | ✅ | ✅ |
| Manage plans & contracts | — | — | — | ✅ (perm) | ✅ |
| Financial data & refunds | — | — | — | finance perm | ✅ |
| Manage staff, roles, settings | — | — | — | — | ✅ |
| Read audit logs | — | — | — | read-only | ✅ |

`ADMIN_STAFF` is a role gate; the actual reach comes from `role_permissions`
plus per-staff resort scope. Permission keys follow `<group>.<action>`:
`members.read`, `members.write`, `finance.read`, `finance.refund`,
`inventory.write`, `bookings.override`, `settings.write`, `audit.read`.

---

## C. Screen List

Public: `/`, `/how-it-works`, `/resorts`, `/resorts/$slug`, `/membership`,
`/offers`, `/about`, `/faq`, `/contact`, `/auth` (login + register + reset).

Member (`/_authenticated/member/*`): `dashboard`, `membership`, `holidays`
(search → results → unit detail → guests → review → payment → confirmation),
`bookings`, `bookings/$id`, `payments`, `documents`, `profile`, `support`.

Owner (`/_authenticated/owner/*`): `dashboard`, `ownership`, `ownership/$id`,
`use` (Use / Guest / Rent / Exchange chooser), `rentals`, `rentals/$id`,
`exchange`, `earnings`, `payments`, `documents`, `profile`.

Admin (`/_authenticated/admin/*`): `dashboard`, `members`, `members/$id`,
`owners`, `owners/$id`, `plans`, `contracts`, `resorts`, `resorts/$id`
(buildings, units, room types, amenities, seasons), `calendar`, `bookings`,
`bookings/$id`, `payments`, `maintenance`, `refunds`, `rentals`, `exchange`,
`documents`, `tickets`, `notifications`, `reports`, `staff`, `roles`,
`audit`, `settings`.

Every route needs loading, empty and error states, and works at 360 px.

---

## D. Booking / Points / Entitlement Logic

Search: date range + guests + resort/room filter → candidate units where every
date in range has `availability.status = 'available'`, no matching blackout,
and the resort is in the plan/contract scope.

Cost: `points = Σ(room_type.base_points_per_night × season.points_multiplier)`
for each night; nights-based plans consume 1 unit per night. Fees =
`base_nightly_fee × nights + taxes + configured surcharges`.

Commit (single transaction, exact order):

1. authenticated → 2. account active → 3. membership/ownership valid for the
dates → 4. maintenance fees not blocking → 5. inside booking window →
6. dates valid (min/max stay, check-in day rules) → 7. inventory available →
8. blackout rules → 9. entitlement balance ≥ cost → 10. points/nights
calculated → 11. fees calculated → 12. reservation + items created →
13. `availability` rows locked `FOR UPDATE` and set to `booked` →
14. entitlement ledger `hold` → 15. payment captured → ledger `consume` →
16. confirmation notification + document.

Failure at any step rolls back everything. Payment failure releases the hold
and returns inventory to `available` via a timeout job (15 min hold window).

Cancellation: policy from `system_settings` (e.g. ≥60 days 100 % entitlement
restored, 30–59 days 50 %, <30 days 0 %, fees non-refundable). Writes a
`cancellations` row, ledger `release` delta, refund record, inventory release.

---

## E–G. Workflows

**Admin:** onboard member/owner → issue contract → generate entitlement →
publish inventory → run maintenance billing cycle → manage calendar
(block / release / reserve / maintenance / owner allocation) → handle
cancellations and refunds → approve rentals/exchanges → publish reports.
Every mutation writes `audit_logs` with before/after.

**Member:** register → verify → contract linked → dashboard shows nights or
points, next booking, maintenance due → search → book → pay → confirmation →
manage or cancel → download invoices and statements.

**Owner:** dashboard shows ownership, entitlement available/used, upcoming
stays, rental income, exchange credits, maintenance due → choose Use (book for
self), Guest (book naming a guest), Rent (create listing, set price, accept
booking, receive payout minus commission), or Exchange (deposit entitlement for
credits, request a stay elsewhere).

---

## H. Security Specification

RLS enabled on every table, no exceptions. Patterns:

- self-owned rows: `USING (auth.uid() = user_id)` on select/insert/update
- member/owner child rows: join back to `members`/`owners` by owner id
- resort-scoped staff: `public.staff_can_access_resort(auth.uid(), resort_id)`
- finance tables: `has_permission(auth.uid(), 'finance.read')`
- super admin: `has_role(auth.uid(), 'SUPER_ADMIN')` on all commands
- ledgers and `audit_logs`: insert-only for the app, no update/delete policy
- public reads (`resorts`, `room_types`, `resort_amenities`,
  `membership_plans`, `membership_benefits`): narrow `TO anon` SELECT with
  `status = 'published'`, safe columns only

Service-role usage is limited to webhook handlers, the maintenance billing job
and Auth Admin calls, always after verifying the caller. Server functions do
all validation; the client never decides eligibility.

---

## I. Payment Specification

Razorpay. Order created in a server function after re-computing the amount
server-side (never trust the client). Client opens checkout; on success the
authoritative path is the webhook at
`/api/public/webhooks/razorpay`: verify `X-Razorpay-Signature` with HMAC-SHA256
and `timingSafeEqual`, dedupe on `provider_payment_id`, append a
`payment_transactions` row, then advance `payments.status` and the dependent
record (reservation confirmed, maintenance fee paid, rental payout queued).
Refunds go through the provider API and record a `refunds` row plus a ledger
entry. Invoices are generated after capture with sequential numbering.

## J. Notification Specification

Events: registration, contract activated, booking confirmed, booking reminder
(T-7, T-1), cancellation, refund processed, maintenance fee issued / due soon /
overdue, rental booked, payout sent, exchange approved, ticket replied.
Channels: in-app (`notifications` table) + email in Stage 13; WhatsApp/SMS and
push are later additions behind the same dispatcher interface. Templates live
in `system_settings` so copy changes need no deploy.

## K. Production Testing Checklist

Schema normalized · RLS verified per role with negative tests · auth flows
(register, login, reset, session expiry) · permission matrix enforced ·
concurrent booking of the same unit-date (two parallel requests, exactly one
wins) · payment webhook signature accepted/rejected · refund end-to-end ·
cancellation policy tiers · inventory lock and release on timeout · entitlement
ledger balances reconcile · audit logs on every admin mutation · error, loading
and empty states on every route · 360 px responsive pass · no seed/test data in
production · no secrets in the client bundle · no service-role use in
user-facing reads · backups configured · final UAT sign-off.

## L. Stage Order (17 prompts)

01 foundation ✅ · 02 schema + grants + RLS scaffolding · 03 auth + roles ·
04 RLS hardening + audit triggers ✅ · 05 membership engine ✅ · 06 ownership engine ✅ ·
07 resort/inventory engine ✅ · 08 booking engine ✅ · 09 payments + maintenance ✅ ·
10 member portal ✅ · 11 owner portal ✅ · 12 admin portal ✅ · 13 notifications +
documents ✅ · 14 reports ✅ · 15 production hardening ✅ · 16 testing + bug fixing ·
17 deployment.

Test after each stage before starting the next.

## Platform notes

This build runs on Lovable Cloud (managed Postgres, Auth, Storage) with
TanStack Start server functions for app-internal logic and
`src/routes/api/public/*` server routes for webhooks — the equivalent of the
Supabase + Edge Functions design described in the concept, with no separate
accounts to manage.

---

## Stage 17 — Production Deployment Checklist

Code is deployment-ready; the final publish is a user action (Publish button).

Verified before release:
- Build, typecheck and lint clean; no console errors on public routes.
- Security scan: no critical or error-level findings. One informational warning
  remains (signed-in users can execute `SECURITY DEFINER` RPCs) — intentional:
  every such function performs its own role/ownership authorization internally,
  and `PUBLIC`/`anon` execute is revoked.
- RLS negative tests pass for anonymous access on all private tables.
- Discovery: `public/robots.txt` + dynamic `/sitemap.xml`; portal routes excluded.
- SEO: every content route declares its own `head()` title/description/OG tags.
- Payments: Razorpay webhook verifies HMAC signature; secret keys server-only.
- Storage: `member-documents` bucket private, per-user folder policies.

Post-publish steps (owner):
1. Publish from the editor to the `.lovable.app` URL.
2. Connect the custom domain in Project settings → Domains.
3. Point the Razorpay live webhook at
   `https://<domain>/api/public/webhooks/razorpay` and set the live keys.
4. Create the first admin account and assign the `admin` role.
