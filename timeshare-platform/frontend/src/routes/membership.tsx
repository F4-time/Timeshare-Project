import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";

import { PageShell } from "@/components/PageShell";
import { RouteError, RoutePending } from "@/components/RouteStates";
import { listMembershipPlans, money } from "@/lib/catalogue";

const plansQuery = queryOptions({
  queryKey: ["public-plans"],
  queryFn: listMembershipPlans,
});

type MembershipPlan = Awaited<ReturnType<typeof listMembershipPlans>>[number];

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
    <>
      <PageShell
        eyebrow="Membership"
        title="Choose How You Want to Stay"
        intro="Four memberships, one network. Pick the rhythm that matches how you travel — daily escapes, weekly holidays, monthly long stays or a yearly legacy commitment."
      >
        {plans.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Our membership tiers are being updated. Please check back shortly.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-6 bg-transparent md:grid-cols-2 xl:grid-cols-4">
            {plans.map((plan) => (
              <div
                key={plan.id}
                className="group flex flex-col rounded-lg border border-border bg-card p-8 shadow-md transition-all duration-300 hover:-translate-y-1 hover:scale-105 hover:border-accent/50 hover:shadow-xl"
              >
                <p className="text-xs uppercase tracking-widest text-accent group-hover:text-accent/80 transition-colors">
                  {plan.benefits?.cadence ?? plan.benefits?.tier ?? plan.benefits?.code ?? "Plan"}
                </p>
                <h2 className="mt-2 font-display text-2xl transition-colors duration-300 group-hover:text-accent">
                  {plan.name}
                </h2>
                {plan.benefits?.tagline ? (
                  <p className="mt-2 text-base text-muted-foreground transition-colors group-hover:text-foreground/80">
                    {plan.benefits.tagline}
                  </p>
                ) : null}
                <p className="mt-4 text-lg font-medium">
                  {entitlementLabel(plan)}{" "}
                  <span className="text-sm text-muted-foreground">every year</span>
                </p>
                <ul className="mt-6 flex-1 space-y-3 text-sm text-muted-foreground">
                  {(plan.benefits?.items ?? []).map((b) => (
                    <li key={b.label} className="flex gap-2 group/item">
                      <span className="group-hover/item:text-accent transition-colors">•</span>
                      <span>
                        <span className="text-foreground">{b.label}</span>
                        {b.detail ? ` — ${b.detail}` : ""}
                      </span>
                    </li>
                  ))}
                  {plan.benefits?.booking_window_days ? (
                    <li className="flex gap-2 group/item">
                      <span className="transition-colors group-hover/item:text-accent">•</span>
                      <span>
                        {plan.benefits.booking_window_days}-day booking window ·{" "}
                        {plan.benefits.perpetual ? "perpetual" : `${plan.duration_years}-year term`}
                      </span>
                    </li>
                  ) : null}
                </ul>
                <p className="mt-8 border-t border-border pt-6 text-xs uppercase tracking-widest text-accent transition-colors group-hover:text-accent/80">
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

      {/* Compare All Memberships Section */}
      {plans.length > 0 && (
        <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-16 w-full">
          <h2 className="mb-10 font-display text-3xl sm:text-4xl">Compare all four memberships</h2>
          <div className="overflow-x-auto border border-border rounded-lg shadow-md hover:shadow-lg transition-shadow">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b border-border">
                <tr>
                  <th className="text-left py-4 px-6 font-semibold text-foreground">Feature</th>
                  {plans.map((plan) => (
                    <th key={plan.id} className="text-left py-4 px-6 font-semibold text-foreground">
                      <div className="text-xs text-accent mb-1">{plan.benefits?.cadence}</div>
                      {plan.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                <tr className="hover:bg-muted/30 transition-colors">
                  <td className="py-4 px-6 text-foreground font-medium">Cadence</td>
                  {plans.map((plan) => (
                    <td key={plan.id} className="py-4 px-6 text-muted-foreground hover:text-foreground transition-colors">
                      {plan.benefits?.cadence}
                    </td>
                  ))}
                </tr>
                <tr className="hover:bg-muted/30 transition-colors">
                  <td className="py-4 px-6 text-foreground font-medium">Stay length</td>
                  {plans.map((plan) => (
                    <td key={plan.id} className="py-4 px-6 text-muted-foreground hover:text-foreground transition-colors">
                      {plan.benefits?.stay_length}
                    </td>
                  ))}
                </tr>
                <tr className="hover:bg-muted/30 transition-colors">
                  <td className="py-4 px-6 text-foreground font-medium">Yearly allocation</td>
                  {plans.map((plan) => (
                    <td key={plan.id} className="py-4 px-6 text-muted-foreground hover:text-foreground transition-colors">
                      {plan.annual_nights
                        ? `${plan.annual_nights} nights every membership year`
                        : plan.annual_points
                          ? `${plan.annual_points.toLocaleString("en-IN")} Forever Credits every year`
                          : "—"}
                    </td>
                  ))}
                </tr>
                <tr className="hover:bg-muted/30 transition-colors">
                  <td className="py-4 px-6 text-foreground font-medium">Forever Credits</td>
                  {plans.map((plan) => (
                    <td key={plan.id} className="py-4 px-6 text-muted-foreground hover:text-foreground transition-colors">
                      {plan.benefits?.credits}
                    </td>
                  ))}
                </tr>
                <tr className="hover:bg-muted/30 transition-colors">
                  <td className="py-4 px-6 text-foreground font-medium">Credit carry forward</td>
                  {plans.map((plan) => (
                    <td key={plan.id} className="py-4 px-6 text-muted-foreground hover:text-foreground transition-colors">
                      {plan.benefits?.credit_carry_forward} of unused credits carry to next year
                    </td>
                  ))}
                </tr>
                <tr className="hover:bg-muted/30 transition-colors">
                  <td className="py-4 px-6 text-foreground font-medium">Guests included</td>
                  {plans.map((plan) => (
                    <td key={plan.id} className="py-4 px-6 text-muted-foreground hover:text-foreground transition-colors">
                      {plan.benefits?.guests} included
                    </td>
                  ))}
                </tr>
                <tr className="hover:bg-muted/30 transition-colors">
                  <td className="py-4 px-6 text-foreground font-medium">Booking window</td>
                  {plans.map((plan) => (
                    <td key={plan.id} className="py-4 px-6 text-muted-foreground hover:text-foreground transition-colors">
                      {plan.benefits?.booking_window_days}-day booking window
                    </td>
                  ))}
                </tr>
                <tr className="hover:bg-muted/30 transition-colors">
                  <td className="py-4 px-6 text-foreground font-medium">Cancellation</td>
                  {plans.map((plan) => (
                    <td key={plan.id} className="py-4 px-6 text-muted-foreground hover:text-foreground transition-colors">
                      {plan.benefits?.cancellation}
                    </td>
                  ))}
                </tr>
                <tr className="hover:bg-muted/30 transition-colors">
                  <td className="py-4 px-6 text-foreground font-medium">Best for</td>
                  {plans.map((plan) => (
                    <td key={plan.id} className="py-4 px-6 text-muted-foreground hover:text-foreground transition-colors">
                      {plan.benefits?.best_for}
                    </td>
                  ))}
                </tr>
                <tr className="hover:bg-muted/30 transition-colors">
                  <td className="py-4 px-6 text-foreground font-medium">Membership term</td>
                  {plans.map((plan) => (
                    <td key={plan.id} className="py-4 px-6 text-muted-foreground hover:text-foreground transition-colors">
                      {plan.benefits?.perpetual ? "Perpetual" : `${plan.duration_years} years`}
                    </td>
                  ))}
                </tr>
                <tr className="bg-muted/30 hover:bg-muted/50 transition-colors">
                  <td className="py-4 px-6 text-foreground font-semibold">Indicative price</td>
                  {plans.map((plan) => (
                    <td key={plan.id} className="py-4 px-6 text-foreground font-semibold hover:text-accent transition-colors">
                      {money(plan.price, plan.currency)}
                      {plan.maintenance_fee && (
                        <div className="text-sm text-muted-foreground">
                          + {money(plan.maintenance_fee, plan.currency)}/yr
                        </div>
                      )}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground mt-4">
            Indicative pricing. Your final price depends on location, property, nights, category and duration.
          </p>
        </section>
      )}

      {/* What Each Includes Section */}
      {plans.length > 0 && (
        <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-16 w-full">
          <h2 className="mb-10 font-display text-3xl sm:text-4xl">What each membership includes</h2>
          <div className="grid grid-cols-1 gap-10 md:grid-cols-2 lg:grid-cols-4">
            {plans.map((plan) => (
              <div key={plan.id} className="flex flex-col group p-6 rounded-lg hover:bg-muted/30 transition-all duration-300">
                {plan.benefits?.cadence && (
                  <p className="text-xs uppercase tracking-widest text-accent group-hover:text-accent/80 transition-colors mb-3">
                    {plan.benefits.cadence}
                  </p>
                )}
                <h3 className="font-display text-2xl group-hover:text-accent transition-colors duration-300 mb-4">{plan.name}</h3>
                <ul className="space-y-3 text-sm text-muted-foreground flex-1">
                  {(plan.benefits?.items ?? []).map((item) => (
                    <li key={item.label} className="flex gap-2 group/item hover:translate-x-1 transition-transform">
                      <span className="text-accent group-hover/item:scale-125 transition-transform origin-left">•</span>
                      <span>
                        <span className="text-foreground font-medium group-hover/item:text-accent transition-colors">{item.label}</span>
                        {item.detail && <span className="block text-xs mt-1">{item.detail}</span>}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Your Price Depends On Section */}
      <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-16 w-full">
        <h2 className="mb-10 font-display text-3xl sm:text-4xl">Your price depends on</h2>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-5 mb-10">
          <div className="p-6 rounded-2xl bg-amber-50/50 hover:bg-amber-100/50 hover:shadow-md transition-all duration-300 group cursor-default border border-amber-200/30 hover:border-amber-300/50">
            <div className="text-3xl mb-3 group-hover:scale-110 transition-transform origin-left">📍</div>
            <p className="text-foreground font-semibold text-sm group-hover:text-amber-900 transition-colors">Location</p>
            <p className="text-muted-foreground text-xs mt-1 group-hover:text-foreground/70 transition-colors">Regional destination</p>
          </div>
          <div className="p-6 rounded-2xl bg-amber-50/50 hover:bg-amber-100/50 hover:shadow-md transition-all duration-300 group cursor-default border border-amber-200/30 hover:border-amber-300/50">
            <div className="text-3xl mb-3 group-hover:scale-110 transition-transform origin-left">🏢</div>
            <p className="text-foreground font-semibold text-sm group-hover:text-amber-900 transition-colors">Property</p>
            <p className="text-muted-foreground text-xs mt-1 group-hover:text-foreground/70 transition-colors">Resort or villa</p>
          </div>
          <div className="p-6 rounded-2xl bg-amber-50/50 hover:bg-amber-100/50 hover:shadow-md transition-all duration-300 group cursor-default border border-amber-200/30 hover:border-amber-300/50">
            <div className="text-3xl mb-3 group-hover:scale-110 transition-transform origin-left">🌙</div>
            <p className="text-foreground font-semibold text-sm group-hover:text-amber-900 transition-colors">Number of nights</p>
            <p className="text-muted-foreground text-xs mt-1 group-hover:text-foreground/70 transition-colors">Annual allocation</p>
          </div>
          <div className="p-6 rounded-2xl bg-amber-50/50 hover:bg-amber-100/50 hover:shadow-md transition-all duration-300 group cursor-default border border-amber-200/30 hover:border-amber-300/50">
            <div className="text-3xl mb-3 group-hover:scale-110 transition-transform origin-left">⭐</div>
            <p className="text-foreground font-semibold text-sm group-hover:text-amber-900 transition-colors">Property category</p>
            <p className="text-muted-foreground text-xs mt-1 group-hover:text-foreground/70 transition-colors">Room type & amenities</p>
          </div>
          <div className="p-6 rounded-2xl bg-amber-50/50 hover:bg-amber-100/50 hover:shadow-md transition-all duration-300 group cursor-default border border-amber-200/30 hover:border-amber-300/50">
            <div className="text-3xl mb-3 group-hover:scale-110 transition-transform origin-left">📅</div>
            <p className="text-foreground font-semibold text-sm group-hover:text-amber-900 transition-colors">Duration</p>
            <p className="text-muted-foreground text-xs mt-1 group-hover:text-foreground/70 transition-colors">Contract term</p>
          </div>
        </div>

        {/* CTA Section */}
        <div className="bg-amber-50/50 border border-amber-200/30 rounded-2xl p-8 sm:p-12 shadow-md hover:shadow-xl hover:border-amber-300/50 transition-all duration-300 group">
          <div className="max-w-2xl">
            <h3 className="font-display text-2xl sm:text-3xl mb-4 text-amber-950 group-hover:text-amber-900 transition-colors">Get Your Forever Plan</h3>
            <p className="text-base text-muted-foreground mb-6 group-hover:text-foreground/80 transition-colors">
              Tell us how you travel and we will match you to the right membership.
            </p>
            <Link
              to="/contact"
              className="inline-flex items-center gap-2 px-8 py-3 bg-amber-600 text-white rounded-full hover:bg-amber-700 hover:shadow-lg hover:scale-105 transition-all duration-300 font-semibold transform active:scale-95"
            >
              Calculate My Plan
              <span className="text-lg">→</span>
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}

function entitlementLabel(plan: MembershipPlan) {
  if (plan.annual_nights) return `${plan.annual_nights} nights`;
  if (plan.annual_points) return `${plan.annual_points.toLocaleString("en-IN")} Forever Credits`;
  return "Flexible entitlement";
}
