import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { CalendarDays, Check, Loader2, MapPin, Search, Users } from "lucide-react";
import { toast } from "sonner";

import { PortalPage } from "@/components/portal/PortalShell";
import { RouteError } from "@/components/RouteStates";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAccount } from "@/hooks/useAccount";
import { listResorts } from "@/lib/catalogue";
import { fetchMyMembership } from "@/lib/membership";
import { fetchMemberOverview } from "@/lib/portal-queries";
import {
  createBooking,
  formatDate,
  inr,
  isoDaysFromNow,
  searchAvailability,
  type RoomOption,
  type SearchResult,
} from "@/lib/booking-api";

export const Route = createFileRoute("/_authenticated/member/holidays")({
  head: () => ({ meta: [{ title: "Book a Holiday — Forever Timeshare" }] }),
  errorComponent: RouteError,
  component: HolidaysPage,
});

function HolidaysPage() {
  const { data: account } = useAccount();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const resorts = useQuery({ queryKey: ["public-resorts"], queryFn: listResorts });

  // Nights plans are debited per night, points plans per season-weighted point.
  // Showing points to a nights member would misstate what the stay costs them.
  const memberId = account?.member?.id ?? null;
  const overview = useQuery({
    queryKey: ["member-overview", memberId],
    queryFn: () => fetchMemberOverview(memberId),
    enabled: account !== undefined,
  });
  const membership = useQuery({
    queryKey: ["my-membership", memberId],
    queryFn: () => fetchMyMembership(memberId),
    enabled: account !== undefined,
  });
  const isPoints = overview.data?.entitlementKind === "POINTS";

  const [resortId, setResortId] = useState("");
  const [checkIn, setCheckIn] = useState(isoDaysFromNow(14));
  const [checkOut, setCheckOut] = useState(isoDaysFromNow(17));
  const [adults, setAdults] = useState(2);
  const [children, setChildren] = useState(0);
  const [result, setResult] = useState<SearchResult | null>(null);
  const [confirmed, setConfirmed] = useState<{ reference: string; fees: number } | null>(null);
  const [pendingOption, setPendingOption] = useState<RoomOption | null>(null);

  const effectiveResortId = resortId || resorts.data?.[0]?.id || "";

  const search = useMutation({
    mutationFn: () =>
      searchAvailability({ resortId: effectiveResortId, checkIn, checkOut, adults, children }),
    onSuccess: (data) => {
      setResult(data);
      setConfirmed(null);
      if (data.options.length === 0) toast.info("Nothing free for those dates. Try different ones.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const book = useMutation({
    mutationFn: (option: RoomOption) =>
      createBooking({
        resortId: effectiveResortId,
        roomTypeId: option.roomTypeId,
        checkIn,
        checkOut,
        adults,
        children,
      }),
    onSuccess: async (data) => {
      setConfirmed({ reference: data.reference, fees: data.totalFees });
      setResult(null);
      setPendingOption(null);
      await qc.invalidateQueries({ queryKey: ["my-bookings"] });
      await qc.invalidateQueries({ queryKey: ["member-overview"] });
      toast.success(`Booked — ${data.reference}`);
    },
    onError: (e: Error) => {
      setPendingOption(null);
      toast.error(e.message);
    },
  });

  const noMembership = account && !account.member;

  function handleReserve(option: RoomOption) {
    if (noMembership) {
      toast.error("Please choose a plan first — you haven't selected a membership plan yet.");
      navigate({ to: "/membership" });
      return;
    }
    setPendingOption(option);
  }

  return (
    <PortalPage title="Book a holiday" description="Search the collection and reserve your stay.">
      {noMembership && (
        <div className="mb-6 rounded-xl border border-dashed border-border bg-background p-6 text-sm text-muted-foreground">
          No membership is linked to your account yet.{" "}
          <Link to="/membership" className="text-accent underline-offset-4 hover:underline">
            Choose a plan
          </Link>{" "}
          to unlock bookings.
        </div>
      )}

      <form
        className="rounded-xl border border-border bg-background p-5"
        onSubmit={(e) => {
          e.preventDefault();
          search.mutate();
        }}
      >
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
          <div className="space-y-1.5 lg:col-span-2">
            <Label htmlFor="resort">
              <MapPin className="mr-1 inline h-3.5 w-3.5 text-accent" />
              Destination
            </Label>
            <select
              id="resort"
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={effectiveResortId}
              onChange={(e) => setResortId(e.target.value)}
            >
              {resorts.data?.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="in">
              <CalendarDays className="mr-1 inline h-3.5 w-3.5 text-accent" />
              Check-in
            </Label>
            <Input
              id="in"
              type="date"
              min={isoDaysFromNow(0)}
              value={checkIn}
              onChange={(e) => {
                setCheckIn(e.target.value);
                if (e.target.value >= checkOut) {
                  const next = new Date(`${e.target.value}T00:00:00`);
                  next.setDate(next.getDate() + 1);
                  setCheckOut(next.toISOString().slice(0, 10));
                }
              }}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="out">
              <CalendarDays className="mr-1 inline h-3.5 w-3.5 text-accent" />
              Check-out
            </Label>
            <Input
              id="out"
              type="date"
              min={checkIn}
              value={checkOut}
              onChange={(e) => setCheckOut(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="ad">
                <Users className="mr-1 inline h-3.5 w-3.5 text-accent" />
                Adults
              </Label>
              <Input
                id="ad"
                type="number"
                min={1}
                max={20}
                value={adults}
                onChange={(e) => setAdults(Math.max(1, Number(e.target.value) || 1))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ch">Children</Label>
              <Input
                id="ch"
                type="number"
                min={0}
                max={20}
                value={children}
                onChange={(e) => setChildren(Math.max(0, Number(e.target.value) || 0))}
              />
            </div>
          </div>
        </div>

        <div className="mt-4 flex justify-end">
          <Button type="submit" disabled={!effectiveResortId || search.isPending}>
            {search.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Search className="mr-2 h-4 w-4" />
            )}
            Search availability
          </Button>
        </div>
      </form>

      {confirmed && (
        <div className="mt-6 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-6">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-700">
              <Check className="h-4 w-4" />
            </span>
            <div>
              <h2 className="font-serif text-lg">Reservation {confirmed.reference}</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Held for you. Fees of {inr.format(confirmed.fees)} are payable at check-in until
                online payment goes live. Your entitlement has been debited.
              </p>
              <Link
                to="/member/bookings"
                className="mt-3 inline-block text-sm text-accent underline-offset-4 hover:underline"
              >
                View my bookings
              </Link>
            </div>
          </div>
        </div>
      )}

      {result && (
        <section className="mt-6">
          <h2 className="font-serif text-lg">
            {result.resort.name} · {formatDate(result.checkIn)} – {formatDate(result.checkOut)}
          </h2>
          <p className="text-sm text-muted-foreground">
            {result.nights} night{result.nights === 1 ? "" : "s"} · {adults} adult
            {adults === 1 ? "" : "s"}
            {children > 0 ? ` · ${children} child${children === 1 ? "" : "ren"}` : ""}
          </p>

          {result.options.length === 0 ? (
            <div className="mt-4 rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              Nothing available for those dates. Try shifting them, or another destination.
            </div>
          ) : (
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              {result.options.map((o) => (
                <article key={o.roomTypeId} className="rounded-xl border border-border bg-background p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-serif text-lg">{o.name}</h3>
                      <p className="text-xs uppercase tracking-widest text-muted-foreground">
                        Sleeps {o.maxAdults} adults · {o.maxChildren} children
                      </p>
                    </div>
                    <span className="rounded-full bg-secondary px-3 py-1 text-xs text-muted-foreground">
                      {o.unitsAvailable} left
                    </span>
                  </div>

                  {o.description && (
                    <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{o.description}</p>
                  )}

                  <dl className="mt-4 space-y-1 text-sm">
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">Entitlement</dt>
                      <dd>
                        {isPoints
                          ? `${o.points} points`
                          : `${result.nights} night${result.nights === 1 ? "" : "s"}`}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">Fees</dt>
                      <dd>{inr.format(o.fee)}</dd>
                    </div>
                  </dl>

                  <Button
                    className="mt-5 w-full"
                    disabled={book.isPending && book.variables?.roomTypeId === o.roomTypeId}
                    onClick={() => handleReserve(o)}
                  >
                    {book.isPending && book.variables?.roomTypeId === o.roomTypeId && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    Reserve this
                  </Button>
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      <Dialog open={Boolean(pendingOption)} onOpenChange={(open) => !open && setPendingOption(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm your booking</DialogTitle>
          </DialogHeader>

          {pendingOption && result && (
            <div className="rounded-lg border border-border p-4 text-sm">
              <div className="flex items-center justify-between">
                <span className="font-serif text-base">{pendingOption.name}</span>
                <span className="text-xs uppercase tracking-widest text-muted-foreground">
                  {result.resort.name}
                </span>
              </div>
              <dl className="mt-3 space-y-1.5">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Dates</dt>
                  <dd>
                    {formatDate(result.checkIn)} – {formatDate(result.checkOut)}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Guests</dt>
                  <dd>
                    {adults} adult{adults === 1 ? "" : "s"}
                    {children ? `, ${children} child${children === 1 ? "" : "ren"}` : ""}
                  </dd>
                </div>
                <div className="mt-2 flex justify-between border-t border-border pt-2">
                  <dt className="text-muted-foreground">
                    {isPoints ? "Points to deduct" : "Nights to deduct"}
                  </dt>
                  <dd className="font-medium">
                    {isPoints
                      ? `${pendingOption.points} points`
                      : `${result.nights} night${result.nights === 1 ? "" : "s"}`}
                  </dd>
                </div>
                <div className="flex justify-between text-base font-medium">
                  <dt>Fees payable</dt>
                  <dd>{inr.format(pendingOption.fee)}</dd>
                </div>
                <div className="flex justify-between text-sm">
                  <dt className="text-muted-foreground">Remaining amount owed (after this booking)</dt>
                  <dd>{inr.format((membership.data?.remainingFees ?? 0) + pendingOption.fee)}</dd>
                </div>
              </dl>
              <p className="mt-3 text-xs text-muted-foreground">
                This amount will be deducted from your selected plan once you confirm.
              </p>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              variant="outline"
              className="w-full"
              onClick={() => setPendingOption(null)}
              disabled={book.isPending}
            >
              Cancel
            </Button>
            <Button
              className="w-full"
              disabled={book.isPending}
              onClick={() => pendingOption && book.mutate(pendingOption)}
            >
              {book.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Check className="mr-2 h-4 w-4" />
              )}
              Confirm Booking
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PortalPage>
  );
}
