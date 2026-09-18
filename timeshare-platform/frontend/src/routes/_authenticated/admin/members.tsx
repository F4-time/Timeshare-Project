import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ChevronDown, ChevronRight, Loader2, Users } from "lucide-react";

import { PortalPage } from "@/components/portal/PortalShell";
import { RouteError } from "@/components/RouteStates";
import { fetchAdminMembers } from "@/lib/admin-members";
import { formatDate } from "@/lib/booking-api";

export const Route = createFileRoute("/_authenticated/admin/members")({
  head: () => ({ meta: [{ title: "Members — Administration" }] }),
  errorComponent: RouteError,
  component: AdminMembersPage,
});

const STATUS_TONE: Record<string, string> = {
  active: "bg-emerald-500/15 text-emerald-700",
  pending: "bg-amber-500/15 text-amber-700",
  suspended: "bg-destructive/10 text-destructive",
  cancelled: "bg-muted text-muted-foreground",
  confirmed: "bg-emerald-500/15 text-emerald-700",
  completed: "bg-primary/10 text-primary",
  checked_in: "bg-accent/15 text-accent",
  no_show: "bg-destructive/10 text-destructive",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_TONE[status] ?? "bg-muted text-muted-foreground"}`}>
      {status.replace("_", " ")}
    </span>
  );
}

function AdminMembersPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-members"],
    queryFn: fetchAdminMembers,
  });
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (isLoading) {
    return (
      <PortalPage title="Members">
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-accent" />
        </div>
      </PortalPage>
    );
  }

  if (error) {
    return (
      <PortalPage title="Members">
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-sm text-destructive">
          {(error as Error).message}
        </div>
      </PortalPage>
    );
  }

  // Only members who have actually booked a stay are useful here.
  const members = (data ?? []).filter((m) => m.bookings.length > 0);

  return (
    <PortalPage title="Members" description="Every member with a booking, their plan and their full booking history.">
      {members.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          No members have booked a stay yet.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-background">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/40 text-left">
              <tr>
                <th className="w-8 px-4 py-3" />
                <th className="px-4 py-3 font-medium">Member</th>
                <th className="px-4 py-3 font-medium">Plan</th>
                <th className="hidden px-4 py-3 font-medium sm:table-cell">Status</th>
                <th className="hidden px-4 py-3 font-medium md:table-cell">Bookings</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => {
                const isOpen = expanded.has(m.id);
                return (
                  <>
                    <tr
                      key={m.id}
                      className="cursor-pointer border-b border-border last:border-0 hover:bg-muted/30"
                      onClick={() => toggle(m.id)}
                    >
                      <td className="px-4 py-3 text-muted-foreground">
                        {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium">{m.fullName ?? "—"}</div>
                        <div className="text-xs text-muted-foreground">
                          {m.email ?? "—"} · {m.memberCode}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {m.planName ?? <span className="text-muted-foreground">No plan</span>}
                      </td>
                      <td className="hidden px-4 py-3 sm:table-cell">
                        <StatusBadge status={m.status} />
                      </td>
                      <td className="hidden px-4 py-3 text-muted-foreground md:table-cell">
                        {m.bookings.length}
                      </td>
                    </tr>
                    {isOpen && (
                      <tr key={`${m.id}-detail`} className="border-b border-border bg-muted/20 last:border-0">
                        <td colSpan={5} className="px-4 py-4">
                          {m.bookings.length === 0 ? (
                            <p className="text-sm text-muted-foreground">No bookings yet.</p>
                          ) : (
                            <div className="overflow-x-auto rounded-lg border border-border bg-background">
                              <table className="w-full text-sm">
                                <thead className="border-b border-border bg-muted/40 text-left">
                                  <tr>
                                    <th className="px-3 py-2 font-medium">Resort / Room</th>
                                    <th className="px-3 py-2 font-medium">Check-in</th>
                                    <th className="px-3 py-2 font-medium">Check-out</th>
                                    <th className="px-3 py-2 font-medium">Nights</th>
                                    <th className="px-3 py-2 font-medium">Adults</th>
                                    <th className="px-3 py-2 font-medium">Children</th>
                                    <th className="px-3 py-2 font-medium">Status</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {m.bookings.map((b) => (
                                    <tr key={b.id} className="border-b border-border last:border-0">
                                      <td className="px-3 py-2">
                                        <div className="font-medium">{b.resortName ?? "—"}</div>
                                        <div className="text-xs text-muted-foreground">{b.roomTypeName ?? "—"}</div>
                                      </td>
                                      <td className="px-3 py-2">{formatDate(b.checkIn)}</td>
                                      <td className="px-3 py-2">{formatDate(b.checkOut)}</td>
                                      <td className="px-3 py-2">{b.nights}</td>
                                      <td className="px-3 py-2">{b.adults}</td>
                                      <td className="px-3 py-2">{b.children}</td>
                                      <td className="px-3 py-2">
                                        <StatusBadge status={b.status} />
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
        <Users className="h-3.5 w-3.5" />
        Click a row to see that member's check-in/check-out dates, guest counts and plan usage.
      </p>
    </PortalPage>
  );
}
