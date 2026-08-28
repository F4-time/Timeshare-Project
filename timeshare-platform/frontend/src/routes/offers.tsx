import { createFileRoute, Link } from "@tanstack/react-router";
import { CalendarClock, Gift, Percent, Sparkles } from "lucide-react";

import { PageShell } from "@/components/PageShell";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/offers")({
  head: () => ({
    meta: [
      { title: "Seasonal Offers & Member Benefits — Forever Timeshare" },
      {
        name: "description",
        content:
          "Current Forever Timeshare offers: launch pricing on membership tiers, bonus nights, referral rewards and off-season stay credits.",
      },
      { property: "og:title", content: "Seasonal Offers & Member Benefits — Forever Timeshare" },
      {
        property: "og:description",
        content: "Launch pricing, bonus nights, referral rewards and off-season stay credits.",
      },
    ],
  }),
  component: OffersPage,
});

const OFFERS = [
  {
    icon: Percent,
    tag: "Launch pricing",
    title: "Founding member rates",
    body: "Join any tier during the founding season and lock the enrolment price for the full term of your contract, with maintenance fees fixed for the first two years.",
  },
  {
    icon: Gift,
    tag: "Bonus nights",
    title: "Two extra nights, first year",
    body: "Nights-based plans receive two bonus nights credited to your first entitlement year, usable at any published resort outside peak blackout dates.",
  },
  {
    icon: Sparkles,
    tag: "Referral",
    title: "Refer a family, earn a stay",
    body: "When a referred household completes enrolment, both accounts receive a complimentary two-night stay credit added to the entitlement ledger.",
  },
  {
    icon: CalendarClock,
    tag: "Off-season",
    title: "Shoulder-season points relief",
    body: "Stays booked in designated shoulder seasons are priced at a reduced points multiplier, so your entitlement stretches further across the year.",
  },
];

function OffersPage() {
  return (
    <PageShell
      eyebrow="Offers"
      title="Benefits worth planning your year around."
      intro="Offers are applied at enrolment or credited to your entitlement ledger. Terms follow your plan or ownership contract."
    >
      <div className="grid gap-6 md:grid-cols-2">
        {OFFERS.map((offer) => (
          <article
            key={offer.title}
            className="rounded-2xl border border-border bg-card p-8 transition-shadow hover:shadow-lg"
          >
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-secondary text-accent">
                <offer.icon className="h-5 w-5" aria-hidden />
              </span>
              <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                {offer.tag}
              </span>
            </div>
            <h2 className="mt-6 font-display text-2xl">{offer.title}</h2>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{offer.body}</p>
          </article>
        ))}
      </div>

      <div className="mt-12 flex flex-col items-start gap-4 rounded-2xl border border-border bg-secondary/50 p-8 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-display text-2xl">Ready to choose a plan?</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Compare tiers, entitlements and booking windows side by side.
          </p>
        </div>
        <div className="flex gap-3">
          <Button asChild>
            <Link to="/membership">View membership plans</Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/contact">Talk to us</Link>
          </Button>
        </div>
      </div>
    </PageShell>
  );
}
