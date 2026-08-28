import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, Loader2, MapPin } from "lucide-react";
import { toast } from "sonner";

import { PortalPage } from "@/components/portal/PortalShell";
import { RouteError } from "@/components/RouteStates";
import { Button } from "@/components/ui/button";
import { cancelBooking, formatDate, inr, listMyBookings, type BookingRow } from "@/lib/booking-api";

export const Route = createFileRoute("/_authenticated/member/bookings")({
  head: () => ({ meta: [{ title: "My Bookings — Forever Timeshare" }] }),
  errorComponent: RouteError,
  component: BookingsPage,
});

const STATUS_TONE: Record<string, string> = {
  pending: "bg-amber-500/15 text-amber-700",
  confirmed: "bg-emerald-500/15 text-emerald-700",
  cancelled: "bg-muted text-muted-foreground",
  completed: "bg-primary/10 text-primary",
  checked_in: "bg-accent/15 text-accent",
  no_show: "bg-destructive/10 text-destructive",
};

function BookingsPage() {
  const { data, isLoading, error } = useQuery({ queryKey: ["my-bookings"], queryFn: listMyBookings });

  if (isLoading) {
    return (
      <PortalPage title="My bookings">
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-accent" />
        </div>
      </PortalPage>
    );
  }

  if (error) {
    return (
      <PortalPage title="My bookings">
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-sm text-destructive">
          {(error as Error).message}
        </div>
      </PortalPage>
    );
  }

  const bookings = data ?? [];
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = bookings.filter((b) => b.check_in >= today && b.status !== "cancelled");
  const past = bookings.filter((b) => b.check_in < today || b.status === "cancelled");

  return (
    <PortalPage title="My bookings" description="Your upcoming and past stays.">
      {bookings.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-background p-10 text-center">
          <p className="text-sm text-muted-foreground">You have no reservations yet.</p>
          <Button asChild className="mt-4">
            <Link to="/member/holidays">Find a holiday</Link>
          </Button>
        </div>
      ) : (
        <>
          <section className="mb-8">
            <h2 className="mb-3 font-serif text-lg">Upcoming</h2>
            {upcoming.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing booked yet.</p>
            ) : (
              <div className="space-y-3">
                {upcoming.map((b) => (
                  <BookingCard key={b.id} booking={b} cancellable />
                ))}
              </div>
            )}
          </section>

          {past.length > 0 && (
            <section>
              <h2 className="mb-3 font-serif text-lg">Past and cancelled</h2>
              <div className="space-y-3">
                {past.map((b) => (
                  <BookingCard key={b.id} booking={b} />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </PortalPage>
  );
}

function BookingCard({ booking, cancellable }: { booking: BookingRow; cancellable?: boolean }) {
  const qc = useQueryClient();

  const cancel = useMutation({
    mutationFn: () => cancelBooking(booking.id, "Cancelled by member"),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["my-bookings"] });
      await qc.invalidateQueries({ queryKey: ["member-overview"] });
      toast.success("Reservation cancelled and entitlement returned");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const spent = Number(booking.points_used) > 0
    ? `${Number(booking.points_used)} points`
    : `${Number(booking.nights_used)} night${Number(booking.nights_used) === 1 ? "" : "s"}`;

  return (
    <article className="rounded-xl border border-border bg-background p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-serif text-lg">{booking.resorts?.name ?? "Your stay"}</h3>
            <span
              className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${STATUS_TONE[booking.status] ?? "bg-muted text-muted-foreground"}`}
            >
              {booking.status.replace("_", " ")}
            </span>
          </div>
          {booking.resorts?.location && (
            <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
              <MapPin className="h-3 w-3" /> {booking.resorts.location}
            </p>
          )}
        </div>
        <span className="font-mono text-xs text-muted-foreground">{booking.reference}</span>
      </div>

      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-xs text-muted-foreground">Dates</dt>
          <dd className="mt-0.5 flex items-center gap-1">
            <CalendarDays className="h-3.5 w-3.5 text-accent" />
            {formatDate(booking.check_in)} – {formatDate(booking.check_out)}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Nights</dt>
          <dd className="mt-0.5">{booking.nights}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Entitlement used</dt>
          <dd className="mt-0.5">{spent}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Fees</dt>
          <dd className="mt-0.5">{inr.format(Number(booking.total_fees))}</dd>
        </div>
      </dl>

      {cancellable && booking.status !== "cancelled" && (
        <div className="mt-4 flex justify-end">
          <Button variant="outline" size="sm" disabled={cancel.isPending} onClick={() => cancel.mutate()}>
            {cancel.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Cancel reservation
          </Button>
        </div>
      )}
    </article>
  );
}
