import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";

import { PageShell } from "@/components/PageShell";
import { RouteError, RoutePending } from "@/components/RouteStates";
import { entitlementLabel, listMembershipPlans, money } from "@/lib/catalogue";

const plansQuery = queryOptions({
  queryKey: ["public-plans"],
  queryFn: listMembershipPlans,
});

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
  loader: ({ context }) => context.queryClient.ensureQueryData(plansQuery),
  errorComponent: RouteError,
  pendingComponent: () => <RoutePending label="Loading plans" />,
  component: MembershipPage,
});

function MembershipPage() {
  const { data: plans } = useSuspenseQuery(plansQuery);

  return (
    <PageShell
      eyebrow="Membership"
      title="Four tiers. One registry."
      intro="Plans are data, not code. Nights, points, resort access, booking windows and tenure are all defined by the administrator and applied by the booking engine at reservation time."
    >
      {plans.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Our membership tiers are being updated. Please check back shortly.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-px overflow-hidden rounded-xl bg-border md:grid-cols-2 lg:grid-cols-4">
          {plans.map((plan) => (
            <div key={plan.id} className="flex flex-col bg-card p-5 sm:p-8">
              <p className="text-xs uppercase tracking-widest text-accent">
                {plan.benefits?.tier ?? plan.benefits?.code ?? "Plan"}
              </p>
              <h2 className="mt-2 font-display text-2xl">{plan.name}</h2>
              <p className="mt-4 text-lg font-medium">
                {entitlementLabel(plan)}{" "}
                <span className="text-sm text-muted-foreground">every year</span>
              </p>
              <ul className="mt-6 flex-1 space-y-3 text-sm text-muted-foreground">
                {(plan.benefits?.items ?? []).map((b) => (
                  <li key={b.label}>
                    <span className="text-foreground">{b.label}</span>
                    {b.detail ? ` — ${b.detail}` : ""}
                  </li>
                ))}
                {plan.benefits?.booking_window_days ? (
                  <li>
                    {plan.benefits.booking_window_days}-day booking window ·{" "}
                    {plan.benefits.perpetual ? "perpetual" : `${plan.duration_years}-year term`}
                  </li>
                ) : null}
              </ul>
              <p className="mt-8 border-t border-border pt-6 text-xs uppercase tracking-widest text-accent">
                {money(plan.price, plan.currency)}
                {plan.maintenance_fee
                  ? ` · ${money(plan.maintenance_fee, plan.currency)} annual upkeep`
                  : ""}
              </p>
            </div>
          ))}
        </div>
      )}
    </PageShell>
  );
}
