import { createFileRoute } from "@tanstack/react-router";

import { PageShell } from "@/components/PageShell";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "About — Forever Timeshare" },
      {
        name: "description",
        content:
          "Forever Timeshare operates a curated portfolio of resorts on behalf of its members and owners, with transparent ledgers and audited administration.",
      },
      { property: "og:title", content: "About — Forever Timeshare" },
      {
        property: "og:description",
        content: "Who we are and how the portfolio is administered.",
      },
    ],
  }),
  component: AboutPage,
});

const PILLARS = [
  {
    h: "Transparent ledgers",
    p: "Points and nights move through append-only ledger entries — never by overwriting a balance.",
  },
  {
    h: "Separated concerns",
    p: "Ownership, entitlement and reservation are distinct records, so a booking never rewrites a title.",
  },
  {
    h: "Audited administration",
    p: "Every administrative change is captured with actor, timestamp and prior value.",
  },
];

function AboutPage() {
  return (
    <PageShell
      eyebrow="About"
      title="Custodians, not vendors."
      intro="Forever Timeshare administers a portfolio of resorts on behalf of the people who hold rights in it. Every entitlement movement, fee and reservation is recorded in a ledger that members, owners and auditors can reconcile."
    >
      <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
        {PILLARS.map((item) => (
          <div key={item.h} className="border border-primary/5 bg-card p-5 sm:p-8">
            <h2 className="font-display text-xl">{item.h}</h2>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{item.p}</p>
          </div>
        ))}
      </div>
    </PageShell>
  );
}
