import { createFileRoute } from "@tanstack/react-router";
import { MapPin } from "lucide-react";

import { PageShell } from "@/components/PageShell";
import destLonavala from "@/assets/dest-lonavala.jpg";
import destKarjat from "@/assets/dest-karjat.jpg";
import destIgatpuri from "@/assets/dest-igatpuri.jpg";
import destMahabaleshwar from "@/assets/dest-mahabaleshwar.jpg";
import destAlibaug from "@/assets/dest-alibaug.jpg";
import destMurud from "@/assets/dest-murud.jpg";

const DESTINATIONS = [
  {
    name: "Lonavala",
    setting: "Sahyadri Valley",
    image: destLonavala,
    description: "Mist-covered ridges, green valleys and peaceful hillside stays close to Mumbai.",
  },
  {
    name: "Karjat",
    setting: "Riverside Villa",
    image: destKarjat,
    description: "A quiet riverside retreat framed by tropical gardens and the Sahyadri foothills.",
  },
  {
    name: "Igatpuri",
    setting: "Hill Lake",
    image: destIgatpuri,
    description: "Calm lake views, dramatic mountain scenery and cool-weather escapes.",
  },
  {
    name: "Mahabaleshwar",
    setting: "Valley Sunrise",
    image: destMahabaleshwar,
    description: "Wake to sweeping valley sunrises in Maharashtra's celebrated hill country.",
  },
  {
    name: "Alibaug",
    setting: "Palm Beach",
    image: destAlibaug,
    description: "Palm-lined shores, warm coastal air and relaxed beachside living.",
  },
  {
    name: "Murud",
    setting: "Sea Fort Coastline",
    image: destMurud,
    description: "An unhurried Konkan coastline overlooking the historic Murud-Janjira sea fort.",
  },
];

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
  component: ResortsPage,
});

function ResortsPage() {
  return (
    <PageShell
      eyebrow="Destinations Near Mumbai"
      title="Six escapes. One unforgettable region."
      intro="From misty Sahyadri valleys to palm-lined Konkan beaches, discover handpicked holiday settings within easy reach of Mumbai."
    >
      <div className="grid grid-cols-1 gap-x-7 gap-y-12 md:grid-cols-2 lg:grid-cols-3">
        {DESTINATIONS.map((destination) => (
          <article key={destination.name} className="group">
            <div className="mb-5 aspect-[4/3] w-full overflow-hidden rounded-lg bg-muted shadow-luxe">
              <img
                src={destination.image}
                alt={`${destination.setting} holiday setting in ${destination.name}`}
                width={900}
                height={675}
                loading="lazy"
                className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.04]"
              />
            </div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase text-accent">
              <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
              Maharashtra
            </div>
            <h2 className="mt-2 font-display text-2xl">{destination.name}</h2>
            <p className="mt-1 text-sm font-medium text-foreground">{destination.setting}</p>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              {destination.description}
            </p>
          </article>
        ))}
      </div>
    </PageShell>
  );
}
