# Forever Timeshare — Architecture Overview

Condensed overview. The full detail (every table and field, role/permission
matrix, screen list, booking logic, RLS, payments, notifications, testing
checklist, 17-stage prompt order) lives in `docs/MASTER-BUILD-SPEC.md`.


## 1. Stack

- TanStack Start (React 19 + TypeScript, Vite 7, SSR), Tailwind v4, shadcn/ui
- Lovable Cloud (Postgres, Auth, Storage) — enabled in Stage 02
- Server logic: `createServerFn`; raw HTTP (Razorpay webhooks) via
  `src/routes/api/public/*`
- Payments: Razorpay + signature-verified webhooks + transaction ledger
- Notifications: email first; WhatsApp/SMS/push later

## 2. Roles

`MEMBER`, `OWNER`, `RESORT_STAFF`, `ADMIN_STAFF`, `SUPER_ADMIN`.
Roles live in `user_roles` (never on `profiles`), checked through a
`security definer` `has_role()` function. Staff scope (resort, finance) is
recorded per staff assignment, not per role name.

## 3. Domain chains

- Member: Membership → Entitlement → Inventory → Availability → Reservation
  → Payment → Usage
- Owner: Ownership → Entitlement → Use / Rent / Exchange / Transfer

Ownership, entitlement and reservation are separate records. No single
"bookings" table.

## 4. Schema groups (Stage 02)

- Identity: `profiles`, `roles`, `permissions`, `user_roles`, `staff`
- Members: `members`, `member_family`, `member_documents`
- Owners: `owners`, `ownership_contracts`, `ownership_units`,
  `ownership_weeks`, `ownership_points`
- Plans: `membership_plans`, `membership_contracts`, `membership_benefits`
- Inventory: `resorts`, `buildings`, `resort_units`, `room_types`,
  `resort_amenities`, `availability`, `blackouts`
- Entitlement: `entitlements`, `entitlement_ledger`, `points_ledger`
- Booking: `reservations`, `reservation_items`, `reservation_guests`,
  `cancellations`
- Money: `maintenance_fees`, `payments`, `payment_transactions`, `invoices`,
  `refunds`
- Marketplace: `rental_listings`, `rental_bookings`, `rental_payouts`,
  `exchange_requests`, `exchange_inventory`, `exchange_transactions`
- Platform: `documents`, `notifications`, `support_tickets`, `audit_logs`,
  `system_settings`

Ledgers are append-only; balances are derived, never overwritten.

## 5. Booking engine (Stage 08)

Server-side only, single transaction, in order:
auth → account active → membership/ownership valid → maintenance eligible →
booking window → date validity → inventory available → blackout rules →
entitlement available → points/nights calculation → fee calculation →
reservation created → inventory locked → entitlement deducted → payment →
confirmation.

Concurrency: unit-date rows locked with `SELECT ... FOR UPDATE` plus an
exclusion constraint on (unit, date range) so double booking is impossible
at the database level.

## 6. Configurable engines

- Membership: fixed nights, floating weeks, points, annual/lifetime/fixed
  term — all plan data, no code changes.
- Ownership: unit / week / points, or combinations, per contract.
- Maintenance fees: amount, due date, grace period, late fee, booking
  restriction — admin configurable; statuses pending / partial / paid /
  overdue / waived.
- Rental commission: configurable percentage split per listing.

## 7. Security

RLS on every table. Members and owners see only their own rows; resort staff
see assigned resorts; finance sees financial tables; super admin sees all.
Every administrative mutation writes an `audit_logs` row with actor,
timestamp, previous value, new value and request metadata.

## 8. Applications

- Public site: Home, How It Works, Resorts, Membership, Offers, About, FAQ,
  Contact, Login, Register
- Member portal: Dashboard, Membership, Holidays, My Bookings, Payments,
  Documents
- Owner portal: Dashboard, My Ownership, Use My Ownership (Use / Guest /
  Rent / Exchange), Earnings
- Admin portal: Dashboard KPIs, management of every entity above, plus the
  inventory calendar (block / release / reserve / maintenance / owner
  allocation)

## 9. Design system

Estate heritage luxe. Deep teal `--brand` (#1a2e35), gold `--accent-gold`
(#c5a059), warm surface (#fdfcf9). Playfair Display for display type, Inter
for UI. Square corners (`--radius: 0`), hairline borders, generous
whitespace, large property photography, restrained motion. Tokens live in
`src/styles.css`; components never hardcode colours.

## 10. Stage order

01 foundation ✅ · 02 schema · 03 auth + roles · 04 RLS · 05 membership ·
06 ownership · 07 inventory · 08 booking · 09 payments + maintenance ·
10 member portal · 11 owner portal · 12 admin portal · 13 notifications +
documents · 14 reports · 15 hardening · 16 testing · 17 deployment.

Test after each stage before starting the next.

## 11. Production definition

Normalized schema; RLS, auth, role permissions, booking concurrency,
webhook verification, refunds, cancellations and inventory locking all
tested; audit logs live; error/loading/empty states everywhere; mobile
responsive; no test data, no exposed secrets, no insecure service-role use;
final UAT signed off.
