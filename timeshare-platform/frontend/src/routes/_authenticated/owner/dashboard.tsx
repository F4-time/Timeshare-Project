import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, FileText, KeyRound, Loader2, Tag, Wallet } from "lucide-react";

import { PortalPage } from "@/components/portal/PortalShell";
import { InfoRow, StatCard } from "@/components/portal/PortalWidgets";
import { useAccount } from "@/hooks/useAccount";
import { fetchOwnerOverview } from "@/lib/owner-accounts";

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
    queryFn: fetchOwnerOverview,
    enabled: account !== undefined,
  });

  const name = account?.profile?.full_name?.split(" ")[0] ?? "there";

  return (
    <PortalPage
      title={`Welcome back, ${name}`}
      description="Read-only view of your resort inventory and current booking status."
    >
      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-accent" />
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard icon={KeyRound} label="Total rooms" value={String(data?.totalRooms ?? 0)} />
            <StatCard icon={CalendarDays} label="Booked rooms" value={String(data?.bookedRooms ?? 0)} />
            <StatCard icon={Tag} label="Rooms available" value={String(data?.availableRooms ?? 0)} />
            <StatCard icon={Wallet} label="Upcoming bookings" value={String(data?.bookings.length ?? 0)} />
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-3">
            <section className="rounded-xl border border-border bg-background p-6 lg:col-span-2">
              <h2 className="font-serif text-lg">Assigned resorts</h2>
              <p className="mt-1 text-sm text-muted-foreground">{data?.resorts?.length ? data.resorts.map((resort) => resort.name).join(", ") : "No resorts assigned"}</p>
              <div className="mt-5 overflow-hidden rounded-lg border border-border">
                <table className="w-full text-sm"><thead className="border-b border-border bg-muted/40 text-left"><tr><th className="px-3 py-2 font-medium">Room type</th><th className="px-3 py-2 font-medium">Total</th><th className="px-3 py-2 font-medium">Booked</th><th className="px-3 py-2 font-medium">Available</th></tr></thead><tbody>{(data?.roomTypes ?? []).map((room) => <tr key={room.name} className="border-b border-border last:border-0"><td className="px-3 py-2">{room.name}</td><td className="px-3 py-2">{room.total}</td><td className="px-3 py-2">{room.booked}</td><td className="px-3 py-2 text-accent-foreground">{room.available}</td></tr>)}</tbody></table>
              </div>
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
          <section className="mt-6 rounded-xl border border-border bg-background p-6">
            <h2 className="font-serif text-lg">Booking schedule</h2>
            <div className="mt-4 space-y-3">{(data?.bookings ?? []).length === 0 ? <p className="text-sm text-muted-foreground">No current or upcoming bookings.</p> : data?.bookings.map((booking) => <div key={booking.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3 text-sm last:border-0 last:pb-0"><div><p className="font-medium">{booking.reference}</p><p className="text-xs text-muted-foreground">{booking.check_in} to {booking.check_out}</p></div><span className="capitalize text-muted-foreground">{booking.status}</span></div>)}</div>
          </section>
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
