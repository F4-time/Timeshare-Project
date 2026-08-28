import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { BadgeCheck, CalendarDays, FileText, Loader2, Palmtree, Wallet } from "lucide-react";

import { PortalPage } from "@/components/portal/PortalShell";
import { InfoRow, StatCard } from "@/components/portal/PortalWidgets";
import { useAccount } from "@/hooks/useAccount";
import { fetchMemberOverview, inr } from "@/lib/portal-queries";

export const Route = createFileRoute("/_authenticated/member/dashboard")({
  head: () => ({
    meta: [{ title: "Member Dashboard — Forever Timeshare" }],
  }),
  component: MemberDashboard,
});

function MemberDashboard() {
  const { data: account } = useAccount();
  const memberId = account?.member?.id ?? null;

  const { data, isLoading } = useQuery({
    queryKey: ["member-overview", memberId],
    queryFn: () => fetchMemberOverview(memberId),
    enabled: account !== undefined,
  });

  const name = account?.profile?.full_name?.split(" ")[0] ?? "there";
  const balanceLabel = data?.entitlementKind === "POINTS" ? "Points available" : "Nights available";

  return (
    <PortalPage
      title={`Welcome back, ${name}`}
      description="Your membership, entitlement balance and holidays in one place."
    >
      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-accent" />
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              icon={BadgeCheck}
              label="Membership"
              value={account?.member?.status ?? "Not linked"}
            />
            <StatCard
              icon={Palmtree}
              label={balanceLabel}
              value={data ? data.entitlementBalance.toLocaleString("en-IN") : "—"}
            />
            <StatCard
              icon={CalendarDays}
              label="Upcoming stays"
              value={String(data?.upcomingCount ?? 0)}
            />
            <StatCard
              icon={Wallet}
              label="Dues outstanding"
              value={data?.duesAmount ? inr.format(data.duesAmount) : "None"}
            />
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-3">
            <section className="rounded-xl border border-border bg-background p-6 lg:col-span-2">
              <h2 className="font-serif text-lg">Next holiday</h2>
              <p className="mt-4 text-sm text-muted-foreground">
                Nothing booked yet. Availability search opens once the booking engine is connected.
              </p>
            </section>

            <aside className="rounded-xl border border-border bg-background p-6">
              <h2 className="font-serif text-lg">Your file</h2>
              <dl className="mt-4 space-y-3 text-sm">
                <InfoRow label="Member code" value={account?.member?.member_code ?? "—"} />
                <InfoRow label="Email" value={account?.profile?.email ?? "—"} />
                <InfoRow label="Roles" value={account?.roles.join(", ") || "—"} />
                <InfoRow label="Documents" value={String(data?.documentCount ?? 0)} />
              </dl>
            </aside>
          </div>
        </>
      )}

      {account && !account.member && (
        <div className="mt-8 flex items-start gap-3 rounded-xl border border-dashed border-border bg-background p-6 text-sm text-muted-foreground">
          <FileText className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
          <p>
            No membership record is linked to your account yet. Our team activates it once your
            contract is processed — until then the figures above stay at zero.
          </p>
        </div>
      )}
    </PortalPage>
  );
}
