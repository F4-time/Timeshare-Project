import { createFileRoute } from "@tanstack/react-router";

import { PageShell } from "@/components/PageShell";
import { MEMBERSHIP_PLANS, entitlementLabel, money } from "@/data/plans";

export const Route = createFileRoute("/membership")({
  head: () => ({
    meta: [
      { title: "Membership Plans — Forever Timeshare" },
      {
        name: "description",
        content:
          "Silver, Gold, Platinum and Signature: annual nights or points, resort access and booking windows, all configurable without code changes.",
      },
      { property: "og:title", content: "Membership Plans — Forever Timeshare" },
      { property: "og:description", content: "Nights and points membership tiers explained." },
    ],
  }),
  component: MembershipPage,
});

function MembershipPage() {
  return (
    <PageShell
      eyebrow="Membership"
      title="Four tiers. One registry."
      intro="Plans are data, not code. Nights, points, resort access, booking windows and tenure are all defined by the administrator and applied by the booking engine at reservation time."
    >
      <div className="grid grid-cols-1 gap-px bg-border md:grid-cols-2 xl:grid-cols-4">
        {MEMBERSHIP_PLANS.map((plan) => (
          <div key={plan.code} className="flex flex-col bg-card p-8">
            <p className="text-xs uppercase tracking-widest text-accent">{plan.tier}</p>
            <h2 className="mt-2 font-display text-2xl">{plan.name}</h2>
            <p className="mt-4 text-lg font-medium">
              {entitlementLabel(plan)}{" "}
              <span className="text-sm text-muted-foreground">every year</span>
            </p>
            <ul className="mt-6 flex-1 space-y-3 text-sm text-muted-foreground">
              {plan.benefits.map((b) => (
                <li key={b.label}>
                  <span className="text-foreground">{b.label}</span>
                  {b.detail ? ` — ${b.detail}` : ""}
                </li>
              ))}
              <li>
                {plan.bookingWindowDays}-day booking window ·{" "}
                {plan.termYears ? `${plan.termYears}-year term` : "perpetual"}
              </li>
            </ul>
            <p className="mt-8 border-t border-border pt-6 text-xs uppercase tracking-widest text-accent">
              {money(plan.price)} · {money(plan.maintenanceBaseFee)} annual upkeep
            </p>
          </div>
        ))}
      </div>
    </PageShell>
  );
}
