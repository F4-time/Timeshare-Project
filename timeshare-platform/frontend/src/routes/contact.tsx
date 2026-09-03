import { createFileRoute } from "@tanstack/react-router";

import { PageShell } from "@/components/PageShell";

export const Route = createFileRoute("/contact")({
  head: () => ({
    meta: [
      { title: "Contact the Concierge — Forever Timeshare" },
      {
        name: "description",
        content:
          "Reach the Forever Timeshare concierge for membership enquiries, owner services and booking support.",
      },
      { property: "og:title", content: "Contact the Concierge — Forever Timeshare" },
      {
        property: "og:description",
        content: "Membership enquiries, owner services and booking support.",
      },
    ],
  }),
  component: ContactPage,
});

const DESKS = [
  { h: "Membership Enquiries", p: "membership@forevertimeshare.com" },
  { h: "Owner Services", p: "owners@forevertimeshare.com" },
  { h: "Booking Support", p: "concierge@forevertimeshare.com" },
];

function ContactPage() {
  return (
    <PageShell
      eyebrow="Concierge"
      title="Speak with us."
      intro="Member portal access, owner services and new membership enquiries are handled by the concierge desk."
    >
      <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
        {DESKS.map((item) => (
          <div key={item.h} className="border border-primary/5 bg-card p-5 sm:p-8">
            <div className="mb-2 text-[10px] uppercase tracking-widest text-muted-foreground">
              {item.h}
            </div>
            <a href={`mailto:${item.p}`} className="break-all text-sm underline-offset-4 hover:underline">
              {item.p}
            </a>
          </div>
        ))}
      </div>
    </PageShell>
  );
}
