import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { CalendarDays, ChevronLeft, CreditCard, Loader2, MapPin, SearchX, Users } from "lucide-react";
import { toast } from "sonner";

import { PageShell } from "@/components/PageShell";
import { RouteError, RoutePending } from "@/components/RouteStates";
import { AuthPromptDialog } from "@/components/AuthPromptDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAccount } from "@/hooks/useAccount";
import { clearBookingIntent, getBookingIntent, setBookingIntent } from "@/lib/booking-intent";
import { resortsQueryOptions, type Resort } from "@/lib/catalogue";
import { fetchMyMembership } from "@/lib/membership";
import { fetchMemberOverview } from "@/lib/portal-queries";
import {
  createBooking,
  formatDate,
  inr,
  isoDaysFromNow,
  searchAvailability,
  type RoomOption,
} from "@/lib/booking-api";
import destLonavala from "@/assets/dest-lonavala.jpg";
import destKarjat from "@/assets/dest-karjat.jpg";
import destIgatpuri from "@/assets/dest-igatpuri.jpg";
import destMahabaleshwar from "@/assets/dest-mahabaleshwar.jpg";
import destAlibaug from "@/assets/dest-alibaug.jpg";
import destMurud from "@/assets/dest-murud.jpg";
import resortTuscany from "@/assets/resort-tuscany.jpg";

const FALLBACK_IMAGES: Record<string, string> = {
  lonavala: destLonavala,
  karjat: destKarjat,
  igatpuri: destIgatpuri,
  mahabaleshwar: destMahabaleshwar,
  alibaug: destAlibaug,
  murud: destMurud,
};

function imageFor(slug: string | null, imageUrl: string | null) {
  return imageUrl ?? (slug ? FALLBACK_IMAGES[slug] : undefined) ?? resortTuscany;
}

export const Route = createFileRoute("/resorts/$slug")({
  head: ({ params }) => ({ meta: [{ title: `${params.slug} — Forever Timeshare` }] }),
  loader: ({ context }) => context.queryClient.ensureQueryData(resortsQueryOptions),
  errorComponent: RouteError,
  pendingComponent: () => <RoutePending label="Loading property" />,
  component: ResortDetailPage,
});

function ResortDetailPage() {
  const { slug } = Route.useParams();
  const { data: resorts } = useSuspenseQuery(resortsQueryOptions);
  const resort = resorts.find((r) => r.slug === slug || r.id === slug);

  if (!resort) {
    return (
      <PageShell eyebrow="Property" title="We couldn't find that stay">
        <Link to="/resorts" className="inline-flex items-center gap-1 text-sm text-accent hover:underline">
          <ChevronLeft className="h-4 w-4" /> Back to destinations
        </Link>
      </PageShell>
    );
  }

  return <PropertyView resort={resort} />;
}

function PropertyView({ resort }: { resort: Resort }) {
  const account = useAccount();
  const navigate = useNavigate();

  const resortSlug = resort.slug ?? resort.id;

  // Restore the in-progress search if the member was sent here to choose a plan mid-booking.
  const resumedIntent = getBookingIntent();
  const resume = resumedIntent?.resortSlug === resortSlug ? resumedIntent : null;

  const [checkIn, setCheckIn] = useState(resume?.checkIn ?? isoDaysFromNow(14));
  const [checkOut, setCheckOut] = useState(resume?.checkOut ?? isoDaysFromNow(17));
  const [adults, setAdults] = useState(resume?.adults ?? 2);
  const [children, setChildren] = useState(resume?.children ?? 0);

  const availability = useQuery({
    queryKey: ["resort-availability", resort.id, checkIn, checkOut, adults, children],
    queryFn: () => searchAvailability({ resortId: resort.id, checkIn, checkOut, adults, children }),
  });

  const [bookingOption, setBookingOption] = useState<RoomOption | null>(null);
  const [authPromptOpen, setAuthPromptOpen] = useState(false);

  // Cover photo plus any gallery extras, de-duplicated so a repeated URL doesn't show twice.
  const photos = [...new Set([imageFor(resort.slug, resort.image_url), ...(resort.gallery ?? [])])];
  const [activePhoto, setActivePhoto] = useState(0);

  // Nudge to the next window of the same length so the visitor doesn't have to guess new dates by hand.
  function handleTryDifferentDates() {
    const nights = Math.max(
      1,
      Math.round((new Date(`${checkOut}T00:00:00`).getTime() - new Date(`${checkIn}T00:00:00`).getTime()) / 86_400_000),
    );
    const nextIn = new Date(`${checkOut}T00:00:00`);
    const nextOut = new Date(nextIn);
    nextOut.setDate(nextOut.getDate() + nights);
    setCheckIn(nextIn.toISOString().slice(0, 10));
    setCheckOut(nextOut.toISOString().slice(0, 10));
  }

  async function handleBookClick(option: RoomOption) {
    if (account.isLoading) return;
    let acct = account.data;
    if (account.isError || !acct) {
      // The signed-in check can be briefly stale right after login (cached error from a
      // prior signed-out visit) — re-verify before assuming the visitor is signed out.
      acct = (await account.refetch()).data;
    }
    if (!acct) {
      setAuthPromptOpen(true);
      return;
    }
    if (!acct.member) {
      setBookingIntent({
        resortSlug,
        resortName: resort.name,
        checkIn,
        checkOut,
        adults,
        children,
      });
      toast.error("Please choose a plan first — you haven't selected a membership plan yet.");
      navigate({ to: "/membership" });
      return;
    }
    setBookingOption(option);
  }

  return (
    <PageShell
      eyebrow={resort.location ?? resort.country ?? "India"}
      title={resort.name}
      intro={resort.description ?? undefined}
    >
      <Link to="/resorts" className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="h-4 w-4" /> All destinations
      </Link>

      <div className="grid grid-cols-1 gap-10 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="aspect-16/9 w-full overflow-hidden rounded-xl bg-muted shadow-luxe">
            <img
              src={photos[Math.min(activePhoto, photos.length - 1)]}
              alt={resort.name}
              className="h-full w-full object-cover"
            />
          </div>
          {photos.length > 1 && (
            <div className="mt-3 flex gap-2 overflow-x-auto">
              {photos.map((src, i) => (
                <button
                  key={`${src}-${i}`}
                  type="button"
                  onClick={() => setActivePhoto(i)}
                  className={`h-16 w-24 shrink-0 overflow-hidden rounded-md border-2 transition-colors ${
                    i === activePhoto ? "border-accent" : "border-transparent"
                  }`}
                  aria-label={`Show photo ${i + 1}`}
                >
                  <img src={src} alt={`${resort.name} ${i + 1}`} className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          )}

          <h2 className="mt-8 font-serif text-xl">About Property</h2>
          <p className="mt-2 flex items-center gap-1 text-xs uppercase tracking-widest text-muted-foreground">
            <MapPin className="h-3.5 w-3.5 text-accent" /> {resort.location ?? resort.country ?? "India"}
          </p>
          {resort.description && (
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{resort.description}</p>
          )}

          {resort.amenities?.items?.length ? (
            <>
              <h3 className="mt-6 font-serif text-lg">Amenities</h3>
              <ul className="mt-3 flex flex-wrap gap-2">
                {resort.amenities.items.map((item) => (
                  <li key={item} className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground">
                    {item}
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </div>

        <aside className="h-fit rounded-xl border border-border bg-background p-5 lg:sticky lg:top-24">
          <h3 className="font-serif text-lg">Plan your stay</h3>
          <div className="mt-4 space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="p-in">
                <CalendarDays className="mr-1 inline h-3.5 w-3.5 text-accent" /> Check-in
              </Label>
              <Input
                id="p-in"
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
              <Label htmlFor="p-out">
                <CalendarDays className="mr-1 inline h-3.5 w-3.5 text-accent" /> Check-out
              </Label>
              <Input id="p-out" type="date" min={checkIn} value={checkOut} onChange={(e) => setCheckOut(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label htmlFor="p-ad">
                  <Users className="mr-1 inline h-3.5 w-3.5 text-accent" /> Adults
                </Label>
                <Input
                  id="p-ad"
                  type="number"
                  min={1}
                  max={20}
                  value={adults}
                  onChange={(e) => setAdults(Math.max(1, Number(e.target.value) || 1))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="p-ch">Children</Label>
                <Input
                  id="p-ch"
                  type="number"
                  min={0}
                  max={20}
                  value={children}
                  onChange={(e) => setChildren(Math.max(0, Number(e.target.value) || 0))}
                />
              </div>
            </div>
          </div>
        </aside>
      </div>

      <section className="mt-10">
        <h2 className="font-serif text-xl">Room Options</h2>
        {availability.isLoading ? (
          <div className="mt-4 flex justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-accent" />
          </div>
        ) : availability.isError ? (
          <div className="mt-4 rounded-xl border border-dashed border-destructive/30 bg-destructive/5 p-8 text-center">
            <SearchX className="mx-auto h-8 w-8 text-destructive" />
            <p className="mt-3 font-medium text-foreground">Couldn't load room options.</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {(availability.error as Error)?.message ?? "Please try again in a moment."}
            </p>
            <Button variant="outline" className="mt-5" onClick={() => availability.refetch()}>
              Try again
            </Button>
          </div>
        ) : availability.data?.options.length === 0 ? (
          // A real, successful search with zero options means the property is genuinely
          // booked out for these dates — don't paper over that with the dummy catalogue.
          <div className="mt-4 rounded-xl border border-dashed border-border bg-background p-8 text-center">
            <SearchX className="mx-auto h-8 w-8 text-muted-foreground" />
            <p className="mt-3 font-medium text-foreground">
              This property is unavailable for {formatDate(checkIn)} – {formatDate(checkOut)}.
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Every room type is already booked for those dates. Try a different window, or explore
              other properties that are free.
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-3">
              <Button variant="outline" onClick={handleTryDifferentDates}>
                Try different dates
              </Button>
              <Button asChild>
                <Link to="/resorts" search={{ checkIn, checkOut, adults, children }}>
                  See similar available properties
                </Link>
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {(availability.data?.options ?? []).map((o) => (
              <RoomOptionCard
                key={o.roomTypeId}
                option={o}
                nights={availability.data?.nights ?? 3}
                onBook={() => handleBookClick(o)}
              />
            ))}
          </div>
        )}
      </section>

      <AuthPromptDialog
        open={authPromptOpen}
        onOpenChange={setAuthPromptOpen}
        redirectTo={`/resorts/${resort.slug}`}
      />

      <GuestDetailsDialog
        open={Boolean(bookingOption)}
        option={bookingOption}
        onOpenChange={(open) => !open && setBookingOption(null)}
        resortId={resort.id}
        checkIn={checkIn}
        checkOut={checkOut}
        adults={adults}
        children={children}
        nights={availability.data?.nights ?? 3}
      />
    </PageShell>
  );
}

function RoomOptionCard({ option, nights, onBook }: { option: RoomOption; nights: number; onBook: () => void }) {
  return (
    <article className="rounded-xl border border-border bg-background p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-serif text-lg">{option.name}</h3>
          <p className="text-xs uppercase tracking-widest text-muted-foreground">
            Sleeps {option.maxAdults} adults · {option.maxChildren} children
          </p>
        </div>
        <span className="rounded-full bg-secondary px-3 py-1 text-xs text-muted-foreground">
          {option.unitsAvailable} left
        </span>
      </div>

      {option.description && <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{option.description}</p>}

      <dl className="mt-4 space-y-1 text-sm">
        <div className="flex justify-between">
          <dt className="text-muted-foreground">Entitlement</dt>
          <dd>
            {nights} night{nights === 1 ? "" : "s"}
          </dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted-foreground">Fees</dt>
          <dd>{inr.format(option.fee)}</dd>
        </div>
      </dl>

      <Button className="mt-5 w-full" onClick={onBook}>
        Book This Now
      </Button>
    </article>
  );
}

const TITLES = ["Mr", "Mrs", "Ms", "Dr"] as const;

function GuestDetailsDialog({
  open,
  onOpenChange,
  option,
  resortId,
  checkIn,
  checkOut,
  adults,
  children,
  nights,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  option: RoomOption | null;
  resortId: string;
  checkIn: string;
  checkOut: string;
  adults: number;
  children: number;
  nights: number;
}) {
  const navigate = useNavigate();
  const account = useAccount();
  const qc = useQueryClient();
  const memberId = account.data?.member?.id ?? null;
  const overview = useQuery({
    queryKey: ["member-overview", memberId],
    queryFn: () => fetchMemberOverview(memberId),
    enabled: Boolean(memberId),
  });
  const membership = useQuery({
    queryKey: ["my-membership", memberId],
    queryFn: () => fetchMyMembership(memberId),
    enabled: Boolean(memberId),
  });
  const isPoints = overview.data?.entitlementKind === "POINTS";
  const unitLabel = isPoints ? "points" : "nights";
  const deduction = option ? (isPoints ? option.points : nights) : 0;
  const planName = overview.data?.planName ?? null;
  const balanceBefore = overview.data?.entitlementBalance ?? null;
  const balanceAfter = balanceBefore !== null ? Math.max(0, balanceBefore - deduction) : null;
  const remainingAmountAfter = (membership.data?.remainingFees ?? 0) + (option?.fee ?? 0);
  const [step, setStep] = useState<"guest" | "payment">("guest");
  const [guestType, setGuestType] = useState<"myself" | "other">("myself");
  const [title, setTitle] = useState<(typeof TITLES)[number]>("Mr");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [mobile, setMobile] = useState("");
  const [attempted, setAttempted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Reset to the first step + prefill from the account profile whenever a fresh
  // room option is opened for booking — fields stay editable either way.
  useEffect(() => {
    if (!open) return;
    setStep("guest");
    setAttempted(false);
    setGuestType("myself");
    const profileName = account.data?.profile?.full_name ?? "";
    const [profileFirst, ...profileRest] = profileName.trim().split(/\s+/).filter(Boolean);
    setFirstName(profileFirst ?? "");
    setLastName(profileRest.join(" "));
    setMobile(account.data?.profile?.phone ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function handleGuestTypeChange(value: "myself" | "other") {
    setGuestType(value);
    setAttempted(false);
    if (value === "myself") {
      const profileName = account.data?.profile?.full_name ?? "";
      const [profileFirst, ...profileRest] = profileName.trim().split(/\s+/).filter(Boolean);
      setFirstName(profileFirst ?? "");
      setLastName(profileRest.join(" "));
      setMobile(account.data?.profile?.phone ?? "");
    } else {
      setFirstName("");
      setLastName("");
      setMobile("");
    }
  }

  // Accepts an optional +91/91 prefix, then a 10-digit Indian mobile number starting 6-9.
  const mobileDigits = mobile.replace(/\D/g, "").replace(/^91(?=\d{10}$)/, "");
  const mobileValid = /^[6-9]\d{9}$/.test(mobileDigits);
  const firstNameError = attempted && !firstName.trim() ? "First name is required" : "";
  const lastNameError = attempted && !lastName.trim() ? "Last name is required" : "";
  const mobileError = !mobile.trim()
    ? attempted
      ? "Mobile number is required"
      : ""
    : !mobileValid
      ? "Enter a valid 10-digit mobile number"
      : "";

  function handleContinue() {
    setAttempted(true);
    if (!firstName.trim() || !lastName.trim() || !mobileValid) return;
    setStep("payment");
  }

  async function handlePayAndBook() {
    if (!option) return;
    const guestName = `${title} ${firstName} ${lastName}`.trim();
    setSubmitting(true);
    try {
      await createBooking({
        resortId,
        roomTypeId: option.roomTypeId,
        checkIn,
        checkOut,
        adults,
        children,
        guestName,
      });
      await qc.invalidateQueries({ queryKey: ["member-overview"] });
      await qc.invalidateQueries({ queryKey: ["my-bookings"] });
      clearBookingIntent();
      toast.success("Booked!");
      onOpenChange(false);
      navigate({ to: "/member/dashboard" });
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {step === "guest" ? (
          <>
            <DialogHeader>
              <DialogTitle>Guest Details</DialogTitle>
            </DialogHeader>

            <RadioGroup
              value={guestType}
              onValueChange={(v) => handleGuestTypeChange(v as "myself" | "other")}
              className="flex gap-6"
            >
              <label className="flex items-center gap-2 text-sm">
                <RadioGroupItem value="myself" /> Myself
              </label>
              <label className="flex items-center gap-2 text-sm">
                <RadioGroupItem value="other" /> Someone Else
              </label>
            </RadioGroup>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>Title</Label>
                <Select value={title} onValueChange={(v) => setTitle(v as (typeof TITLES)[number])}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TITLES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label>First Name</Label>
                <Input
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="First Name"
                  aria-invalid={Boolean(firstNameError)}
                  className={firstNameError ? "border-destructive" : undefined}
                />
                {firstNameError && <p className="text-xs text-destructive">{firstNameError}</p>}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Last Name</Label>
              <Input
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Last Name"
                aria-invalid={Boolean(lastNameError)}
                className={lastNameError ? "border-destructive" : undefined}
              />
              {lastNameError && <p className="text-xs text-destructive">{lastNameError}</p>}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5 text-sm">
                <Label>Email</Label>
                <div className="mt-0.5 text-muted-foreground">{account.data?.profile?.email ?? "—"}</div>
              </div>
              <div className="space-y-1.5">
                <Label>Mobile</Label>
                <Input
                  value={mobile}
                  onChange={(e) => setMobile(e.target.value)}
                  placeholder="10-digit mobile number"
                  inputMode="tel"
                  aria-invalid={Boolean(mobileError)}
                  className={mobileError ? "border-destructive" : undefined}
                />
                {mobileError && <p className="text-xs text-destructive">{mobileError}</p>}
              </div>
            </div>

            <DialogFooter>
              <Button className="w-full" onClick={handleContinue}>
                Continue to Payment
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Review & Pay</DialogTitle>
            </DialogHeader>

            <div className="rounded-lg border border-border p-4">
              <div className="flex items-center justify-between">
                <span className="font-serif text-base">{option?.name}</span>
                <span className="text-xs uppercase tracking-widest text-muted-foreground">
                  {nights} night{nights === 1 ? "" : "s"}
                </span>
              </div>
              <dl className="mt-3 space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Guest</dt>
                  <dd>{`${title} ${firstName} ${lastName}`.trim()}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Dates</dt>
                  <dd>
                    {formatDate(checkIn)} – {formatDate(checkOut)}
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
                  <dt className="text-muted-foreground">Membership plan</dt>
                  <dd>{planName ?? "—"}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">{isPoints ? "Points" : "Nights"} to be deducted</dt>
                  <dd>
                    {deduction} {unitLabel}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">{isPoints ? "Points" : "Nights"} remaining after booking</dt>
                  <dd>
                    {balanceAfter !== null ? balanceAfter.toLocaleString("en-IN") : "—"} {unitLabel}
                  </dd>
                </div>
                <div className="mt-2 flex justify-between border-t border-border pt-2 text-base font-medium">
                  <dt>Total payable</dt>
                  <dd>{option ? inr.format(option.fee) : "—"}</dd>
                </div>
                <div className="flex justify-between text-sm">
                  <dt className="text-muted-foreground">Remaining amount owed (after this booking)</dt>
                  <dd>{inr.format(remainingAmountAfter)}</dd>
                </div>
              </dl>
            </div>

            <DialogFooter className="gap-2 sm:gap-2">
              <Button variant="outline" className="w-full" onClick={() => setStep("guest")} disabled={submitting}>
                Back
              </Button>
              <Button className="w-full" disabled={submitting} onClick={handlePayAndBook}>
                {submitting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <CreditCard className="mr-2 h-4 w-4" />
                )}
                Confirm & Book Now
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

