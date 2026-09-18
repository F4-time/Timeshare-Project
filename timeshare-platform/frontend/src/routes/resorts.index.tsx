import { createFileRoute, Link } from "@tanstack/react-router";
import { useQueries, useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { CalendarDays, Loader2, MapPin, SearchX, Users, X } from "lucide-react";

import { PageShell } from "@/components/PageShell";
import { RouteError, RoutePending } from "@/components/RouteStates";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { resortsQueryOptions } from "@/lib/catalogue";
import { formatDate, isoDaysFromNow, searchAvailability } from "@/lib/booking-api";
import destLonavala from "@/assets/dest-lonavala.jpg";
import destKarjat from "@/assets/dest-karjat.jpg";
import destIgatpuri from "@/assets/dest-igatpuri.jpg";
import destMahabaleshwar from "@/assets/dest-mahabaleshwar.jpg";
import destAlibaug from "@/assets/dest-alibaug.jpg";
import destMurud from "@/assets/dest-murud.jpg";
import resortTuscany from "@/assets/resort-tuscany.jpg";

/** Bundled artwork per resort, used until the database carries an image_url. */
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

type ResortsSearch = {
  checkIn?: string;
  checkOut?: string;
  adults?: number;
  children?: number;
};

export const Route = createFileRoute("/resorts/")({
  validateSearch: (search: Record<string, unknown>): ResortsSearch => ({
    checkIn: typeof search.checkIn === "string" ? search.checkIn : undefined,
    checkOut: typeof search.checkOut === "string" ? search.checkOut : undefined,
    adults: typeof search.adults === "number" ? search.adults : Number(search.adults) || undefined,
    children: typeof search.children === "number" ? search.children : Number(search.children) || undefined,
  }),
  head: () => ({
    meta: [
      { title: "Destinations Near Mumbai — Forever Timeshare" },
      {
        name: "description",
        content:
          "Explore Forever Timeshare escapes near Mumbai in Lonavala, Karjat, Igatpuri, Mahabaleshwar, Alibaug and Murud.",
      },
      { property: "og:title", content: "Destinations Near Mumbai — Forever Timeshare" },
      {
        property: "og:description",
        content: "Discover six memorable Maharashtra escapes within easy reach of Mumbai.",
      },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(resortsQueryOptions),
  errorComponent: RouteError,
  pendingComponent: () => <RoutePending label="Loading destinations" />,
  component: ResortsPage,
});

function ResortsPage() {
  const { data: resorts } = useSuspenseQuery(resortsQueryOptions);
  const routeSearch = Route.useSearch();

  const [checkIn, setCheckIn] = useState(routeSearch.checkIn ?? "");
  const [checkOut, setCheckOut] = useState(routeSearch.checkOut ?? "");
  const [adults, setAdults] = useState(routeSearch.adults ?? 2);
  const [children, setChildren] = useState(routeSearch.children ?? 0);
  // Only becomes non-null once a search actually runs, so the page still shows every
  // destination until the visitor asks to filter by dates.
  const [activeSearch, setActiveSearch] = useState(
    routeSearch.checkIn && routeSearch.checkOut
      ? { checkIn: routeSearch.checkIn, checkOut: routeSearch.checkOut, adults: routeSearch.adults ?? 2, children: routeSearch.children ?? 0 }
      : null,
  );

  const availabilityQueries = useQueries({
    queries: resorts.map((r) => ({
      queryKey: [
        "resort-availability",
        r.id,
        activeSearch?.checkIn,
        activeSearch?.checkOut,
        activeSearch?.adults,
        activeSearch?.children,
      ],
      queryFn: () =>
        searchAvailability({
          resortId: r.id,
          checkIn: activeSearch!.checkIn,
          checkOut: activeSearch!.checkOut,
          adults: activeSearch!.adults,
          children: activeSearch!.children,
        }),
      enabled: Boolean(activeSearch),
      retry: false,
    })),
  });

  const checking = Boolean(activeSearch) && availabilityQueries.some((q) => q.isLoading);
  const visibleResorts = !activeSearch
    ? resorts
    : resorts.filter((_, i) => {
        const q = availabilityQueries[i];
        // Still loading or the backend couldn't be reached — show it rather than risk
        // hiding a property that might actually be free.
        if (q.isLoading || q.isError) return true;
        return (q.data?.options.length ?? 0) > 0;
      });

  function handleSearch() {
    if (!checkIn || !checkOut) return;
    setActiveSearch({ checkIn, checkOut, adults, children });
  }

  function handleClear() {
    setActiveSearch(null);
    setCheckIn("");
    setCheckOut("");
  }

  return (
    <PageShell
      eyebrow="Destinations Near Mumbai"
      title="Six escapes. One unforgettable region."
      intro="From misty Sahyadri valleys to palm-lined Konkan beaches, discover handpicked holiday settings within easy reach of Mumbai."
    >
      <div className="mb-10 rounded-xl border border-border bg-background p-5">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5 sm:items-end">
          <div className="space-y-1.5">
            <Label htmlFor="r-in">
              <CalendarDays className="mr-1 inline h-3.5 w-3.5 text-accent" /> Check-in
            </Label>
            <Input
              id="r-in"
              type="date"
              min={isoDaysFromNow(0)}
              value={checkIn}
              onChange={(e) => {
                setCheckIn(e.target.value);
                if (checkOut && e.target.value >= checkOut) {
                  const next = new Date(`${e.target.value}T00:00:00`);
                  next.setDate(next.getDate() + 1);
                  setCheckOut(next.toISOString().slice(0, 10));
                }
              }}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="r-out">Check-out</Label>
            <Input
              id="r-out"
              type="date"
              min={checkIn || isoDaysFromNow(1)}
              value={checkOut}
              onChange={(e) => setCheckOut(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="r-ad">
              <Users className="mr-1 inline h-3.5 w-3.5 text-accent" /> Adults
            </Label>
            <Input
              id="r-ad"
              type="number"
              min={1}
              max={20}
              value={adults}
              onChange={(e) => setAdults(Math.max(1, Number(e.target.value) || 1))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="r-ch">Children</Label>
            <Input
              id="r-ch"
              type="number"
              min={0}
              max={20}
              value={children}
              onChange={(e) => setChildren(Math.max(0, Number(e.target.value) || 0))}
            />
          </div>
          <Button className="w-full" disabled={!checkIn || !checkOut} onClick={handleSearch}>
            Check availability
          </Button>
        </div>

        {activeSearch && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4 text-sm text-muted-foreground">
            {checking ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Checking availability…
              </span>
            ) : (
              <span>
                Showing {visibleResorts.length} of {resorts.length} destinations available for{" "}
                {formatDate(activeSearch.checkIn)} – {formatDate(activeSearch.checkOut)}.
              </span>
            )}
            <button
              type="button"
              onClick={handleClear}
              className="inline-flex items-center gap-1 text-accent underline-offset-4 hover:underline"
            >
              <X className="h-3.5 w-3.5" /> Clear dates
            </button>
          </div>
        )}
      </div>

      {resorts.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Our collection is being updated. Please check back shortly.
        </p>
      ) : visibleResorts.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-background p-10 text-center">
          <SearchX className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-3 font-medium text-foreground">No destinations are free for those dates.</p>
          <p className="mt-1 text-sm text-muted-foreground">Try a different check-in or check-out date.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-x-7 gap-y-12 md:grid-cols-2 lg:grid-cols-3">
          {visibleResorts.map((resort) => (
            <Link
              key={resort.id}
              to="/resorts/$slug"
              params={{ slug: resort.slug ?? resort.id }}
              search={activeSearch ?? {}}
              className="group block"
            >
              <div className="mb-5 aspect-4/3 w-full overflow-hidden rounded-lg bg-muted shadow-luxe">
                <img
                  src={imageFor(resort.slug, resort.image_url)}
                  alt={`${resort.name} in ${resort.location ?? "India"}`}
                  width={900}
                  height={675}
                  loading="lazy"
                  className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.04]"
                />
              </div>
              <div className="flex items-center gap-2 text-xs font-semibold uppercase text-accent">
                <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
                {resort.location ?? resort.country ?? "India"}
              </div>
              <h2 className="mt-2 font-display text-2xl">{resort.name}</h2>
              {resort.description && (
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                  {resort.description}
                </p>
              )}
              {resort.amenities?.items?.length ? (
                <ul className="mt-4 flex flex-wrap gap-2">
                  {resort.amenities.items.slice(0, 4).map((item) => (
                    <li
                      key={item}
                      className="rounded-full border border-border px-3 py-1 text-[11px] text-muted-foreground"
                    >
                      {item}
                    </li>
                  ))}
                </ul>
              ) : null}
            </Link>
          ))}
        </div>
      )}
    </PageShell>
  );
}

