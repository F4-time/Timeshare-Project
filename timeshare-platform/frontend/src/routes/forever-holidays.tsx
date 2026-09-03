import { createFileRoute, Link } from "@tanstack/react-router";

import { PageShell } from "@/components/PageShell";

export const Route = createFileRoute("/forever-holidays")({
  head: () => ({
    meta: [
      { title: "Forever Holidays \u2014 Turn Your Credits Into Experiences" },
      {
        name: "description",
        content:
          "Use your Forever Credits to discover participating holiday properties and resorts: beaches, mountains, weekend getaways and international destinations.",
      },
      { property: "og:title", content: "Forever Holidays \u2014 Forever Timeshare" },
      {
        property: "og:description",
        content: "Beach holidays, mountain escapes, weekend getaways and resort vacations.",
      },
    ],
  }),
  component: ForeverHolidaysPage,
});

const EXPERIENCES = [
  { icon: "\ud83c\udf34", label: "Beach holidays" },
  { icon: "\ud83c\udfd4\ufe0f", label: "Mountain escapes" },
  { icon: "\ud83c\udf0a", label: "Weekend getaways" },
  { icon: "\ud83c\udfdd\ufe0f", label: "Resort vacations" },
  { icon: "\ud83d\udc68\u200d\ud83d\udc69\u200d\ud83d\udc67", label: "Family holidays" },
  { icon: "\ud83c\udf0e", label: "International destinations" },
] as const;

function ForeverHolidaysPage() {
  return (
    <PageShell
      eyebrow="Forever Holidays"
      title="Turn Your Credits Into Experiences"
      intro="Use your Forever Credits to discover participating holiday properties and resorts across the network."
    >
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-6">
        {EXPERIENCES.map((item) => (
          <div
            key={item.label}
            className="flex flex-col items-center gap-3 border border-border bg-card p-6 text-center shadow-md transition-all duration-300 hover:-translate-y-1 hover:border-accent/50 hover:shadow-xl"
          >
            <span className="text-3xl">{item.icon}</span>
            <p className="text-sm font-medium text-foreground">{item.label}</p>
          </div>
        ))}
      </div>

      <div className="mt-16 border border-amber-200/30 bg-amber-50/50 p-8 text-center sm:p-12">
        <p className="font-display text-2xl text-amber-950 sm:text-3xl">
          Your next holiday is already waiting.
        </p>
        <Link
          to="/resorts"
          className="mt-6 inline-flex items-center gap-2 rounded-full bg-amber-600 px-8 py-3 font-semibold text-white transition-all duration-300 hover:scale-105 hover:bg-amber-700 hover:shadow-lg active:scale-95"
        >
          Explore Destinations
        </Link>
        <p className="mt-6 text-xs text-muted-foreground">
          Availability varies by location, property, dates and membership terms.
        </p>
      </div>
    </PageShell>
  );
}