import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Users,
  Briefcase,
  Users2,
  Truck,
  GraduationCap,
  Handshake,
  CalendarRange,
  Plane,
} from "lucide-react";

import { PageShell } from "@/components/PageShell";

export const Route = createFileRoute("/forever-business")({
  head: () => ({
    meta: [
      { title: "Forever Business \u2014 Smarter Accommodation for Companies" },
      {
        name: "description",
        content:
          "Forever Business gives companies access to participating serviced apartments and accommodation options for employee travel, relocation and project teams.",
      },
      { property: "og:title", content: "Forever Business \u2014 Forever Timeshare" },
      {
        property: "og:description",
        content: "One corporate relationship. Multiple accommodation options.",
      },
    ],
  }),
  component: ForeverBusinessPage,
});

const USE_CASES = [
  { icon: Plane, label: "Employee travel" },
  { icon: Briefcase, label: "Executive stays" },
  { icon: Users2, label: "Project teams" },
  { icon: Truck, label: "Relocation" },
  { icon: GraduationCap, label: "Training programmes" },
  { icon: Users, label: "Client accommodation" },
  { icon: CalendarRange, label: "Long-term assignments" },
  { icon: Handshake, label: "Business travel" },
] as const;

function ForeverBusinessPage() {
  return (
    <PageShell
      eyebrow="Forever Business"
      title="Smarter Accommodation for Businesses"
      intro="Corporate accommodation shouldn't mean expensive hotels every time an employee travels. Forever Business provides companies with access to participating serviced apartments and accommodation options."
    >
      <h2 className="mb-6 font-display text-2xl">Use Forever for</h2>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
        {USE_CASES.map((item) => (
          <div
            key={item.label}
            className="flex flex-col items-center gap-3 border border-border bg-card p-6 text-center shadow-md transition-all duration-300 hover:-translate-y-1 hover:border-accent/50 hover:shadow-xl"
          >
            <item.icon className="h-7 w-7 text-accent" strokeWidth={1.5} />
            <p className="text-sm font-medium text-foreground">{item.label}</p>
          </div>
        ))}
      </div>

      <div className="mt-16 border border-amber-200/30 bg-amber-50/50 p-8 text-center sm:p-12">
        <p className="font-display text-2xl text-amber-950 sm:text-3xl">
          One corporate relationship. Multiple accommodation options.
        </p>
        <Link
          to="/contact"
          className="mt-6 inline-flex items-center gap-2 rounded-full bg-amber-600 px-8 py-3 font-semibold text-white transition-all duration-300 hover:scale-105 hover:bg-amber-700 hover:shadow-lg active:scale-95"
        >
          Talk to Our Corporate Team
        </Link>
      </div>
    </PageShell>
  );
}