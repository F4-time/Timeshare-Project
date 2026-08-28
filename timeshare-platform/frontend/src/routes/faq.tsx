import { createFileRoute } from "@tanstack/react-router";

import { PageShell } from "@/components/PageShell";

export const Route = createFileRoute("/faq")({
  head: () => ({
    meta: [
      { title: "Frequently Asked Questions — Forever Timeshare" },
      {
        name: "description",
        content:
          "Answers on entitlements, maintenance fees, booking windows, cancellations, rentals and exchange credits.",
      },
      { property: "og:title", content: "Frequently Asked Questions — Forever Timeshare" },
      {
        property: "og:description",
        content: "Entitlements, fees, booking windows, rentals and exchange.",
      },
    ],
  }),
  component: FaqPage,
});

const FAQS = [
  {
    q: "What is the difference between a member and an owner?",
    a: "A member holds a purchased right to use inventory under a plan. An owner holds a specific asset — a unit, a week, or a block of points — recorded against a resort.",
  },
  {
    q: "How far ahead can I book?",
    a: "Your booking window is set by your plan or ownership contract, from 90 days to priority booking a full year ahead.",
  },
  {
    q: "What happens if I do not use my nights?",
    a: "Owners may rent unused entitlement through the marketplace or deposit it for exchange credits. Members' carry-forward rules are set per plan.",
  },
  {
    q: "Do maintenance fees affect booking?",
    a: "Yes. Overdue maintenance fees can restrict new reservations, subject to the grace period configured by the administrator.",
  },
];

function FaqPage() {
  return (
    <PageShell eyebrow="Support" title="Questions, answered.">
      <dl className="divide-y divide-border border-y border-border">
        {FAQS.map((item) => (
          <div key={item.q} className="grid grid-cols-1 gap-4 py-8 md:grid-cols-3">
            <dt className="font-display text-xl">{item.q}</dt>
            <dd className="text-sm leading-relaxed text-muted-foreground md:col-span-2">
              {item.a}
            </dd>
          </div>
        ))}
      </dl>
    </PageShell>
  );
}
