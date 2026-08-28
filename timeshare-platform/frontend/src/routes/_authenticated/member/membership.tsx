import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { BadgeCheck, CalendarClock, Loader2, Moon, Sparkles, Wallet } from "lucide-react";

import { PortalPage } from "@/components/portal/PortalShell";
import { StatCard } from "@/components/portal/PortalWidgets";
import { RouteError } from "@/components/RouteStates";
import { Button } from "@/components/ui/button";
import { useAccount } from "@/hooks/useAccount";
import { fetchMyMembership, REASON_LABEL } from "@/lib/membership";
import { formatDate, inr } from "@/lib/booking-api";

export const Route = createFileRoute("/_authenticated/member/membership")({
  head: () => ({ meta: [{ title: "My Membership — Forever Timeshare" }] }),
  errorComponent: RouteError,
  component: MembershipPage,
});

function MembershipPage() {
  const { data: account } = useAccount();
  const memberId = account?.member?.id ?? null;

  const { data, isLoading, error } = useQuery({
    queryKey: ["my-membership", memberId],
    queryFn: () => fetchMyMembership(memberId),
    enabled: account !== undefined,
  });

  if (isLoading) {
    return (
      <PortalPage title="My membership">
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-accent" />
        </div>
      </PortalPage>
    );
  }

  if (error) {
    return (
      <PortalPage title="My membership">
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-sm text-destructive">
          {(error as Error).message}
        </div>
      </PortalPage>
    );
  }

  const plan = data?.contract?.plan ?? null;

  if (!data?.member || !plan) {
    return (
      <PortalPage title="My membership">
        <div className="rounded-xl border border-dashed border-border bg-background p-10 text-center">
          <p className="text-sm text-muted-foreground">
            No membership is linked to your account yet. Once your contract is processed it will
            appear here with your allowance and benefits.
          </p>
          <Button asChild variant="outline" className="mt-4">
            <Link to="/membership">See the plans</Link>
          </Button>
        </div>
      </PortalPage>
    );
  }

  const isPoints = plan.entitlement_kind === "POINTS";
  const allowance = isPoints ? (plan.annual_points ?? 0) : (plan.annual_nights ?? 0);
  const unit = isPoints ? "points" : "nights";
  const current = data.entitlements[0];

  return (
    <PortalPage title={plan.name} description={plan.description ?? "Your plan, allowance and history."}>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={BadgeCheck}
          label="Tier"
          value={plan.benefits?.tier ?? plan.benefits?.code ?? "Member"}
        />
        <StatCard
          icon={Moon}
          label={`${unit} a year`}
          value={allowance.toLocaleString("en-IN")}
        />
        <StatCard
          icon={Sparkles}
          label={`${unit} left${current ? ` (${current.year})` : ""}`}
          value={current ? current.balance.toLocaleString("en-IN") : "—"}
        />
        <StatCard
          icon={CalendarClock}
          label="Booking window"
          value={`${plan.booking_window_days} days`}
        />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <section className="rounded-xl border border-border bg-background p-6 lg:col-span-2">
          <h2 className="font-serif text-lg">What your plan includes</h2>
          {plan.benefits?.items?.length ? (
            <ul className="mt-4 space-y-3 text-sm">
              {plan.benefits.items.map((b) => (
                <li key={b.label} className="flex gap-3">
                  <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                  <span>
                    <span className="font-medium">{b.label}</span>
                    {b.detail ? (
                      <span className="text-muted-foreground"> — {b.detail}</span>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-sm text-muted-foreground">No benefits recorded for this plan.</p>
          )}

          <dl className="mt-6 grid gap-3 border-t border-border pt-6 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs text-muted-foreground">Stay length</dt>
              <dd className="mt-0.5">
                {plan.min_stay_nights}–{plan.max_stay_nights} nights
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Tenure</dt>
              <dd className="mt-0.5">
                {plan.benefits?.perpetual ? "Perpetual" : `${plan.duration_years} years`}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Enrolment price</dt>
              <dd className="mt-0.5">{inr.format(plan.price)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Annual upkeep</dt>
              <dd className="mt-0.5">
                {plan.maintenance_fee ? inr.format(plan.maintenance_fee) : "—"}
              </dd>
            </div>
          </dl>
        </section>

        <aside className="rounded-xl border border-border bg-background p-6">
          <h2 className="font-serif text-lg">Your contract</h2>
          <dl className="mt-4 space-y-3 text-sm">
            <Row label="Member code" value={data.member.member_code} />
            <Row label="Contract" value={data.contract!.contract_number} />
            <Row label="Status" value={data.contract!.status} />
            <Row label="Member since" value={formatDate(data.member.joined_at)} />
            <Row label="Started" value={formatDate(data.contract!.start_date)} />
            <Row
              label="Ends"
              value={data.contract!.end_date ? formatDate(data.contract!.end_date) : "No end date"}
            />
            <Row label="Paid" value={inr.format(data.contract!.price_paid)} />
          </dl>
          <Button asChild className="mt-5 w-full">
            <Link to="/member/holidays">Book a holiday</Link>
          </Button>
        </aside>
      </div>

      {data.entitlements.map((e) => (
        <section key={e.id} className="mt-6 rounded-xl border border-border bg-background p-6">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-serif text-lg">
              {e.year} allowance — {e.balance.toLocaleString("en-IN")} of{" "}
              {e.total_units.toLocaleString("en-IN")} {e.kind === "POINTS" ? "points" : "nights"} left
            </h2>
            {e.valid_to && (
              <span className="text-xs text-muted-foreground">Valid until {formatDate(e.valid_to)}</span>
            )}
          </div>

          {/* Every movement is a separate line; the balance is their sum. */}
          {e.ledger.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">No activity yet.</p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-border text-left">
                  <tr>
                    <th className="py-2 font-medium">Date</th>
                    <th className="py-2 font-medium">Activity</th>
                    <th className="hidden py-2 font-medium sm:table-cell">Detail</th>
                    <th className="py-2 text-right font-medium">Change</th>
                  </tr>
                </thead>
                <tbody>
                  {e.ledger.map((l) => (
                    <tr key={l.id} className="border-b border-border/60 last:border-0">
                      <td className="py-2 text-muted-foreground">
                        {new Date(l.created_at).toLocaleDateString(undefined, {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        })}
                      </td>
                      <td className="py-2">{REASON_LABEL[l.reason] ?? l.reason}</td>
                      <td className="hidden py-2 text-muted-foreground sm:table-cell">
                        {l.notes ?? "—"}
                      </td>
                      <td
                        className={
                          l.delta < 0
                            ? "py-2 text-right text-destructive"
                            : "py-2 text-right text-emerald-700"
                        }
                      >
                        {l.delta > 0 ? "+" : ""}
                        {l.delta}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ))}

      <p className="mt-4 flex items-start gap-2 text-xs text-muted-foreground">
        <Wallet className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        Your balance is the sum of every line above, so any change can be traced to the booking that
        caused it.
      </p>
    </PortalPage>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="truncate text-right capitalize">{value}</dd>
    </div>
  );
}
