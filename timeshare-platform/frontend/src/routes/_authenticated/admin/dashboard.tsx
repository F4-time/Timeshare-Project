import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Building2, CalendarDays, KeyRound, Loader2, Users } from "lucide-react";

import { ComingSoon, PortalPage } from "@/components/portal/PortalShell";
import { StatCard } from "@/components/portal/PortalWidgets";
import { useAccount } from "@/hooks/useAccount";
import { fetchAdminOverview } from "@/lib/portal-queries";

export const Route = createFileRoute("/_authenticated/admin/dashboard")({
  head: () => ({
    meta: [{ title: "Administration — Forever Timeshare" }],
  }),
  component: AdminDashboard,
});

function AdminDashboard() {
  const { data: account } = useAccount();
  const { data, isLoading } = useQuery({
    queryKey: ["admin-overview"],
    queryFn: fetchAdminOverview,
  });

  const name = account?.profile?.full_name?.split(" ")[0] ?? "there";

  return (
    <PortalPage
      title={`Welcome back, ${name}`}
      description="Portfolio health across members, owners, inventory and bookings."
    >
      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-accent" />
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard icon={Users} label="Members" value={String(data?.members ?? 0)} />
          <StatCard icon={KeyRound} label="Owners" value={String(data?.owners ?? 0)} />
          <StatCard icon={Building2} label="Resorts" value={String(data?.resorts ?? 0)} />
          <StatCard
            icon={CalendarDays}
            label="Upcoming bookings"
            value={String(data?.upcomingReservations ?? 0)}
          />
        </div>
      )}

      <div className="mt-6">
        <ComingSoon note="Management screens for members, owners, inventory, finance and audit arrive in the next phase." />
      </div>
    </PortalPage>
  );
}
