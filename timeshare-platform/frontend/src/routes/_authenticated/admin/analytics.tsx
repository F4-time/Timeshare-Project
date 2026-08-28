import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Building2,
  CalendarDays,
  KeyRound,
  Loader2,
  LogIn,
  Moon,
  Users,
  Wallet,
} from "lucide-react";

import { PortalPage } from "@/components/portal/PortalShell";
import { StatCard } from "@/components/portal/PortalWidgets";
import { RouteError } from "@/components/RouteStates";
import { fetchAnalytics, inr, shortAgent } from "@/lib/admin-analytics";

export const Route = createFileRoute("/_authenticated/admin/analytics")({
  head: () => ({ meta: [{ title: "Analytics — Administration" }] }),
  errorComponent: RouteError,
  component: AnalyticsPage,
});

const STATUS_TONE: Record<string, string> = {
  pending: "bg-amber-500/15 text-amber-700",
  confirmed: "bg-emerald-500/15 text-emerald-700",
  cancelled: "bg-muted text-muted-foreground",
  completed: "bg-primary/10 text-primary",
  checked_in: "bg-accent/15 text-accent",
  no_show: "bg-destructive/10 text-destructive",
};

function formatWhen(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function AnalyticsPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-analytics"],
    queryFn: fetchAnalytics,
    refetchInterval: 60_000,
  });

  if (isLoading) {
    return (
      <PortalPage title="Analytics">
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-accent" />
        </div>
      </PortalPage>
    );
  }

  if (error) {
    return (
      <PortalPage title="Analytics">
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-sm text-destructive">
          {(error as Error).message}
        </div>
      </PortalPage>
    );
  }

  const a = data!;
  const maxDay = Math.max(1, ...a.loginsByDay.map((d) => d.logins));
  const statuses = Object.entries(a.bookingsByStatus).sort((x, y) => y[1] - x[1]);

  return (
    <PortalPage title="Analytics" description="Sign-ins, bookings and portfolio activity.">
      <section className="mb-6">
        <h2 className="mb-3 font-serif text-lg">People</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard icon={Users} label="Registered users" value={String(a.totalUsers)} />
          <StatCard icon={Users} label="Members" value={String(a.totalMembers)} />
          <StatCard icon={KeyRound} label="Owners" value={String(a.totalOwners)} />
          <StatCard icon={LogIn} label="Signed in ever" value={String(a.uniqueUsersLoggedIn)} />
        </div>
      </section>

      <section className="mb-6">
        <h2 className="mb-3 font-serif text-lg">Sign-ins</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard icon={LogIn} label="Total logins" value={String(a.totalLogins)} />
          <StatCard icon={LogIn} label="Last 7 days" value={String(a.loginsLast7Days)} />
          <StatCard icon={Building2} label="Resorts" value={String(a.totalResorts)} />
          <StatCard icon={Building2} label="Units" value={String(a.totalUnits)} />
        </div>

        {a.loginsByDay.length > 0 && (
          <div className="mt-4 rounded-xl border border-border bg-background p-5">
            <p className="mb-4 text-[11px] uppercase tracking-[0.15em] text-muted-foreground">
              Logins per day
            </p>
            <div className="flex h-32 items-end gap-2">
              {a.loginsByDay.map((d) => (
                <div key={d.date} className="flex flex-1 flex-col items-center gap-2" title={`${d.date}: ${d.logins}`}>
                  <div
                    className="w-full rounded-t bg-accent/70"
                    style={{ height: `${Math.max(4, (d.logins / maxDay) * 100)}%` }}
                  />
                  <span className="text-[9px] text-muted-foreground">{d.date.slice(5)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      <section className="mb-6">
        <h2 className="mb-3 font-serif text-lg">Bookings</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard icon={CalendarDays} label="Upcoming stays" value={String(a.upcomingStays)} />
          <StatCard icon={Moon} label="Nights sold" value={String(a.nightsSold)} />
          <StatCard icon={Wallet} label="Fees booked" value={inr.format(a.feesBooked)} />
          <StatCard
            icon={CalendarDays}
            label="Reservations"
            value={String(Object.values(a.bookingsByStatus).reduce((s, n) => s + n, 0))}
          />
        </div>

        {statuses.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {statuses.map(([status, count]) => (
              <span
                key={status}
                className={`rounded-full px-3 py-1 text-xs font-medium ${STATUS_TONE[status] ?? "bg-muted text-muted-foreground"}`}
              >
                {status.replace("_", " ")}: {count}
              </span>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 font-serif text-lg">Recent sign-ins</h2>
        {a.recentLogins.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            No sign-ins recorded yet. Logins are tracked from the next sign-in onward.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border bg-background">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-muted/40 text-left">
                <tr>
                  <th className="px-4 py-3 font-medium">User</th>
                  <th className="hidden px-4 py-3 font-medium sm:table-cell">When</th>
                  <th className="hidden px-4 py-3 font-medium md:table-cell">Device</th>
                  <th className="hidden px-4 py-3 font-medium lg:table-cell">IP</th>
                </tr>
              </thead>
              <tbody>
                {a.recentLogins.map((l) => (
                  <tr key={l.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3">
                      <div className="font-medium">{l.profiles?.full_name ?? "—"}</div>
                      <div className="text-xs text-muted-foreground">{l.profiles?.email ?? l.user_id.slice(0, 8)}</div>
                    </td>
                    <td className="hidden px-4 py-3 text-muted-foreground sm:table-cell">{formatWhen(l.login_at)}</td>
                    <td className="hidden px-4 py-3 text-muted-foreground md:table-cell">{shortAgent(l.user_agent)}</td>
                    <td className="hidden px-4 py-3 font-mono text-xs text-muted-foreground lg:table-cell">
                      {l.ip_address ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </PortalPage>
  );
}
