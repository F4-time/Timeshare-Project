import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, FileText, KeyRound, Loader2, Tag, Wallet } from "lucide-react";

import { PortalPage } from "@/components/portal/PortalShell";
import { InfoRow, StatCard } from "@/components/portal/PortalWidgets";
import { useAccount } from "@/hooks/useAccount";
import { fetchOwnerOverview, inr } from "@/lib/portal-queries";

export const Route = createFileRoute("/_authenticated/owner/dashboard")({
  head: () => ({
    meta: [{ title: "Owner Dashboard — Forever Timeshare" }],
  }),
  component: OwnerDashboard,
});

function OwnerDashboard() {
  const { data: account } = useAccount();
  const ownerId = account?.owner?.id ?? null;

  const { data, isLoading } = useQuery({
    queryKey: ["owner-overview", ownerId],
    queryFn: () => fetchOwnerOverview(ownerId),
    enabled: account !== undefined,
  });

  const name = account?.profile?.full_name?.split(" ")[0] ?? "there";

  return (
    <PortalPage
      title={`Welcome back, ${name}`}
      description="Your ownership, entitlement and rental activity at a glance."
    >
      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-accent" />
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              icon={KeyRound}
              label="Contracts"
              value={String(data?.contractCount ?? 0)}
            />
            <StatCard icon={Tag} label="Active listings" value={String(data?.activeListings ?? 0)} />
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
              <h2 className="font-serif text-lg">Your entitlement</h2>
              <p className="mt-4 text-sm text-muted-foreground">
                Use, guest, rent and exchange actions arrive with the ownership module.
              </p>
            </section>

            <aside className="rounded-xl border border-border bg-background p-6">
              <h2 className="font-serif text-lg">Your file</h2>
              <dl className="mt-4 space-y-3 text-sm">
                <InfoRow label="Owner code" value={account?.owner?.owner_code ?? "—"} />
                <InfoRow label="Status" value={account?.owner?.status ?? "—"} />
                <InfoRow label="Email" value={account?.profile?.email ?? "—"} />
              </dl>
            </aside>
          </div>
        </>
      )}

      {account && !account.owner && (
        <div className="mt-8 flex items-start gap-3 rounded-xl border border-dashed border-border bg-background p-6 text-sm text-muted-foreground">
          <FileText className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
          <p>
            No ownership record is linked to your account yet. Figures stay at zero until a contract
            is issued against your profile.
          </p>
        </div>
      )}
    </PortalPage>
  );
}
