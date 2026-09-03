import { createFileRoute, Link } from "@tanstack/react-router";
import { Briefcase, Building2, Users2, Home, User } from "lucide-react";

import { PageShell } from "@/components/PageShell";

export const Route = createFileRoute("/forever-city")({
  head: () => ({
    meta: [
      { title: "Forever City \u2014 Serviced Apartments for Individuals & Corporates" },
      {
        name: "description",
        content:
          "Forever City provides access to serviced-apartment stays for business travellers, corporate employees, project teams, families and individuals.",
      },
      { property: "og:title", content: "Forever City \u2014 Your Home Away From Home" },
      {
        property: "og:description",
        content: "Serviced-apartment stays for business travel, relocation and extended stays.",
      },
    ],
  }),
  component: ForeverCityPage,
});

const AUDIENCES = [
  {
    icon: Briefcase,
    title: "Business Travellers",
    body: "Stay comfortably during business trips.",
  },
  {
    icon: Building2,
    title: "Corporate Employees",
    body: "Accommodation for employees travelling or relocating.",
  },
  {
    icon: Users2,
    title: "Project Teams",
    body: "Flexible accommodation for short and extended assignments.",
  },
  {
    icon: Home,
    title: "Families",
    body: "More space, privacy and home-like comfort.",
  },
  {
    icon: User,
    title: "Individuals",
    body: "Short, medium and extended stays.",
  },
] as const;

function ForeverCityPage() {
  return (
    <PageShell
      eyebrow="Forever City"
      title="Your Home Away From Home"
      intro="Whether you're travelling for business, relocating to a new city or simply looking for a more comfortable alternative to a hotel, Forever City provides access to serviced-apartment stays."
    >
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {AUDIENCES.map((item) => (
          <div
            key={item.title}
            className="flex flex-col gap-4 border border-border bg-card p-8 shadow-md transition-all duration-300 hover:-translate-y-1 hover:border-accent/50 hover:shadow-xl"
          >
            <item.icon className="h-8 w-8 text-accent" strokeWidth={1.5} />
            <h2 className="font-display text-xl">{item.title}</h2>
            <p className="text-sm leading-relaxed text-muted-foreground">{item.body}</p>
          </div>
        ))}
      </div>

      <div className="mt-16 border border-amber-200/30 bg-amber-50/50 p-8 text-center sm:p-12">
        <p className="text-base text-muted-foreground">Stay in the city. Feel at home.</p>
        <Link
          to="/resorts"
          className="mt-6 inline-flex items-center gap-2 rounded-full bg-amber-600 px-8 py-3 font-semibold text-white transition-all duration-300 hover:scale-105 hover:bg-amber-700 hover:shadow-lg active:scale-95"
        >
          Find a Stay
        </Link>
      </div>
    </PageShell>
  );
}