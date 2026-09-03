import { createFileRoute } from "@tanstack/react-router";

import { PageShell } from "@/components/PageShell";

export const Route = createFileRoute("/how-it-works")({
  head: () => ({
    meta: [
      { title: "How Timeshare Works — Forever Timeshare" },
      {
        name: "description",
        content:
          "From membership to entitlement to reservation: how the Forever Timeshare booking, ownership and exchange model works.",
      },
      { property: "og:title", content: "How Timeshare Works — Forever Timeshare" },
      {
        property: "og:description",
        content: "Membership, entitlement, inventory, reservation and usage explained.",
      },
    ],
  }),
  component: HowItWorksPage,
});

const MEMBER_CHAIN = [
  "Membership",
  "Entitlement",
  "Inventory",
  "Availability",
  "Reservation",
  "Payment",
  "Usage",
];

const OWNER_CHAIN = ["Ownership", "Entitlement", "Use · Rent · Exchange · Transfer"];

function Chain({ title, steps }: { title: string; steps: string[] }) {
  return (
    <div className="border border-primary/5 bg-card p-6 sm:p-10">
      <h2 className="font-display text-2xl">{title}</h2>
      <ol className="mt-8 space-y-4">
        {steps.map((step, i) => (
          <li key={step} className="flex items-baseline gap-4">
            <span className="shrink-0 text-[10px] font-bold uppercase tracking-widest text-accent">
              {String(i + 1).padStart(2, "0")}
            </span>
            <span className="min-w-0 text-sm uppercase tracking-widest">{step}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function HowItWorksPage() {
  return (
    <PageShell
      eyebrow="The Model"
      title="Rights, recorded precisely."
      intro="A reservation is never a single record. It is the outcome of a chain of verifiable rights — which is what makes the ledger auditable and the inventory trustworthy."
    >
      <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
        <Chain title="For Members" steps={MEMBER_CHAIN} />
        <Chain title="For Owners" steps={OWNER_CHAIN} />
      </div>
    </PageShell>
  );
}
