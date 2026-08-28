import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { MapPin } from "lucide-react";

import { PageShell } from "@/components/PageShell";
import { RouteError, RoutePending } from "@/components/RouteStates";
import { listResorts } from "@/lib/catalogue";
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

const resortsQuery = queryOptions({
  queryKey: ["public-resorts"],
  queryFn: listResorts,
});

export const Route = createFileRoute("/resorts/")({
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
  loader: ({ context }) => context.queryClient.ensureQueryData(resortsQuery),
  errorComponent: RouteError,
  pendingComponent: () => <RoutePending label="Loading destinations" />,
  component: ResortsPage,
});

function ResortsPage() {
  const { data: resorts } = useSuspenseQuery(resortsQuery);

  return (
    <PageShell
      eyebrow="Destinations Near Mumbai"
      title="Six escapes. One unforgettable region."
      intro="From misty Sahyadri valleys to palm-lined Konkan beaches, discover handpicked holiday settings within easy reach of Mumbai."
    >
      {resorts.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Our collection is being updated. Please check back shortly.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-x-7 gap-y-12 md:grid-cols-2 lg:grid-cols-3">
          {resorts.map((resort) => (
            <article key={resort.id} className="group">
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
            </article>
          ))}
        </div>
      )}
    </PageShell>
  );
}
