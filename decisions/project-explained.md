# The project, in plain English

No jargon. What this thing is, how the pieces fit, and what actually happens when
someone uses it. Updated as features land.

---

## What we are building

A **timeshare** platform.

Timeshare means you buy the right to holiday somewhere every year, instead of
buying a holiday home outright. A villa costs crores and sits empty most of the
year. Instead, many families each buy a slice — a week, or a pot of "points" —
and take turns using it. Everyone shares the upkeep cost.

So the product has to answer, reliably and forever:

- Who bought what, and what does it entitle them to this year?
- Is the villa free on those dates?
- How much of their allowance does this trip use up?
- Did they pay their annual maintenance bill?

Get any of those wrong and you have either sold the same villa twice, or given
someone a free holiday.

---

## The three kinds of people

**Members** buy a plan (Silver, Gold, Platinum, Signature). A plan gives them a
yearly allowance — either **nights** ("7 nights a year") or **points** (a budget
they spend, where a beach villa in December costs more than a hill studio in
July). They book holidays. They do not own any specific property.

**Owners** own an actual thing — a specific villa, a specific week. They can use
it, lend it to a guest, rent it out for income, or swap it for a stay somewhere
else.

**Staff and admins** run the whole thing: add resorts, issue contracts, manage
the calendar, chase unpaid fees, handle cancellations.

---

## The vocabulary

These words have precise meanings in the system, and mixing them up is how these
systems break:

| Word | Meaning |
| --- | --- |
| **Plan** | A product on the price list. "Gold Retreat, 14 nights a year." |
| **Contract** | One person actually buying a plan. |
| **Entitlement** | Their allowance for one specific year. Gold, 2026: 14 nights. |
| **Ledger** | The running record of that allowance being spent or returned. |
| **Inventory** | Real physical villas and the nights they are free. |
| **Reservation** | One confirmed stay. |

The important bit: an entitlement is **not** a number we edit. It is a starting
figure plus a list of every change since. Booking a 3-night stay does not set
`14` to `11`; it adds a line saying `-3`. The balance is the sum of the lines.

Why bother? Because when a member says "I had 14 nights, why do I have 9?", the
system can show every line that moved it. If we simply overwrote a number, the
answer would be "we don't know". Banks work this way for the same reason.

---

## How a booking works

A booking is not one action. It is a chain, and every link must hold:

1. **Are you logged in**, and is your account active?
2. **Do you have a valid contract** covering these dates?
3. **Have you paid your maintenance fees?** Unpaid bills can block new bookings.
4. **Are you inside your booking window?** Silver can book 180 days ahead,
   Signature a full year. This is the perk you paid for.
5. **Are the dates sensible** — minimum and maximum stay length?
6. **Is a villa actually free** for every single night requested?
7. **Is it a blackout period** — a festival week, or maintenance?
8. **Do you have enough allowance left?**
9. **Work out the cost.** Points are per night × the season multiplier. Peak
   season costs 1.5×, off season 0.75×.
10. **Work out the money** — cleaning and service fees.
11. **Create the reservation.**
12. **Lock those nights** so nobody else can take them.
13. **Hold the allowance** — not spent yet, just reserved.
14. **Take the payment.**
15. **Convert the hold into a spend**, and send the confirmation.

If any step fails, the whole thing unwinds. No half-bookings: no reservation
without payment, no locked villa without a reservation.

**Two people booking the same villa at the same instant** is the classic failure.
Both check "is it free?", both get "yes", both book. We stop this in the database
itself: there is a rule that physically cannot store two overlapping stays for
the same villa. The second one fails. Not "usually" — never.

---

## The pieces

**The website** (`timeshare-platform/frontend`) — everything you see. Public
pages plus the logged-in portals for members, owners and admins.

**The API** (`timeshare-platform/backend`) — the part you cannot see or tamper
with. It exists for things that must not be trusted to a browser: taking
payments, and committing bookings.

**The database** (Supabase/Postgres) — where everything lives. It also enforces
its own security: each row knows who is allowed to read it.

### Why some things go through the API and others do not

The website reads **public** data (resorts, plans) and **your own** data (your
profile, your bookings) straight from the database. That is safe because the
database refuses to hand over anyone else's rows.

But **writing a booking** goes through the API. If the browser could write
reservations directly, anyone could open developer tools and create one with
"points used: 0". The API re-checks everything and is the only thing allowed to
write reservations.

Same for payments: the secret Razorpay key lives only on the server. If it were
in the website, anyone could read it and fake successful payments.

---

## What works today

- The public website: home, destinations, membership plans, offers, about, how
  it works, FAQ, contact.
- Sign up, sign in, password reset.
- New accounts automatically become **members**.
- Logging in sends you to the right portal for your role. A member cannot open
  the admin area — it is blocked by the server, not just hidden.
- Member, owner and admin dashboards, showing real figures from the database.
- Destinations and plans are **live from the database** — an admin will be able
  to change a price without a developer.
- The API is running, and correctly rejects requests with no token or a fake one.
- The full booking and inventory structure exists: 6 resorts, 12 room types,
  48 villas, and a year of nightly availability (17,568 nights).
- **Availability search works.** Give it a resort, dates and guest numbers and it
  returns the room types that are genuinely free for every night, with the price
  in points and rupees. It understands seasons: the same 3-night stay costs 1125
  points in peak season and 562.5 in off season. It refuses stays over 30 nights,
  dates in the past, and check-out before check-in.
- **Booking works, end to end.** A member can be onboarded onto a plan, search,
  and book. Tested against the real database: a member with 14 nights booked a
  3-night stay, their balance became 11, the villa dropped out of availability,
  cancelling gave the 3 nights back, and the ledger showed every movement.
- **It cannot be oversold.** Eight people clicking "book" at the exact same
  instant on four villas produced exactly four bookings and four polite refusals.
  No villa was sold twice. This is enforced by the database, not by careful code.
- **Staff can add resorts and villas themselves.** There is an admin area with a
  real form: add a resort, define its room types (how many it sleeps, what it
  costs), and create villas in bulk. No developer needed. Each new villa gets a
  year of nightly availability automatically, so it is bookable immediately.
- **There is an analytics screen.** How many people have registered, how many
  have ever signed in, sign-ins in the last seven days, a bar chart of sign-ins
  per day, how many resorts and villas exist, bookings by status, nights sold and
  fees booked. Plus a recent sign-in list showing who, when, from which browser
  and which IP address.

One detail worth explaining: the booking figures deliberately exclude cancelled
stays. So "10 reservations, 0 nights sold" is not a bug — it means all ten were
cancelled. Counting them as sales would overstate the business.

- **Members can now book for themselves.** Pick a destination, dates and guests,
  see what is genuinely free with the price, and reserve it. The reservation
  appears under "My bookings", the allowance is debited, and cancelling gives it
  back. Everything a member sees is priced in their own currency — a nights plan
  shows nights, a points plan shows points.

## Who can log in as an admin

There is one login page for everyone. Your role decides where you land: members
go to the member portal, staff to the admin area. A member who types the admin
web address is refused — the block is enforced by the server, not just hidden in
the menu.

The very first administrator has to be created by hand, with a single database
statement. That is deliberate: any "click here to become an admin" route that
works without an existing admin is a way in for an attacker. After that, admins
can promote each other, and the system refuses to remove the last one — otherwise
everyone could be locked out permanently.

## What does not work yet

- **No payment.** Bookings sit at "pending" — the allowance is held but no money
  is taken, and nothing converts the hold into a completed stay.
- **Nothing to click.** Search and booking exist only as an API. There is no
  screen for a member to search or book.
- **No admin screens.** Adding a resort or a villa still means a developer
  writing SQL. Onboarding a member does too, though the function behind the
  future button already exists.
- No maintenance fee billing.
- Member pages beyond the dashboard (my bookings, documents, profile).
- Owner features (renting out, swapping).
- Individual resort detail pages.

## What is next

Two candidates, and they serve different audiences:

**Admin screens** so the business can add its own resorts, villas and members
without a developer. Right now a demo cannot show anyone adding inventory.

**The booking screens** so a member can actually search and book from the
website, rather than the engine only being reachable by API.

---

## An honest summary

The building is up: doors, locks, reception, and the rooms are numbered. The
paperwork that makes it a timeshare business — allowances being spent, villas
being held, money changing hands — is what we are building now.
