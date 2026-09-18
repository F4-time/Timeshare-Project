import { createFileRoute } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { LifeBuoy, Mail, Send, Loader2 } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { PortalPage } from "@/components/portal/PortalShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAccount } from "@/hooks/useAccount";
import { createSupportTicket, listMySupportTickets } from "@/lib/support-tickets";

const CATEGORIES = [
  { value: "membership", label: "Membership Enquiries" },
  { value: "booking", label: "Booking Support" },
  { value: "payments", label: "Payments & Fees" },
  { value: "other", label: "Something else" },
];

const STATUS_LABEL: Record<string, string> = {
  open: "Open",
  in_progress: "In progress",
  resolved: "Resolved",
};

export const Route = createFileRoute("/_authenticated/member/support")({
  head: () => ({ meta: [{ title: "Support — Forever Timeshare" }] }),
  component: SupportPage,
});

function SupportPage() {
  const { data: account } = useAccount();
  const qc = useQueryClient();
  const [category, setCategory] = useState(CATEGORIES[0].value);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");

  const ticketsQuery = useQuery({
    queryKey: ["my-support-tickets"],
    queryFn: listMySupportTickets,
  });

  const mutation = useMutation({
    mutationFn: createSupportTicket,
    onSuccess: async () => {
      toast.success("Message sent — our support team will get back to you soon.");
      setSubject("");
      setMessage("");
      await qc.invalidateQueries({ queryKey: ["my-support-tickets"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!subject.trim() || !message.trim()) {
      toast.error("Please add a subject and a message.");
      return;
    }

    mutation.mutate({
      category,
      subject: subject.trim(),
      message: message.trim(),
      full_name: account?.profile?.full_name ?? null,
      email: account?.profile?.email ?? null,
      member_code: account?.member?.member_code ?? null,
    });
  }

  return (
    <PortalPage title="Support" description="Send a message to the concierge desk and we'll get back to you.">
      <div className="grid gap-4 lg:grid-cols-3">
        <section className="rounded-xl border border-border bg-background p-6 lg:col-span-2">
          <div className="flex items-center gap-2">
            <LifeBuoy className="h-4 w-4 text-accent" />
            <h2 className="font-serif text-lg">Contact us</h2>
          </div>

          <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-1.5">
              <Label htmlFor="category">What's this about?</Label>
              <select
                id="category"
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="subject">Subject</Label>
              <Input
                id="subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="e.g. Question about my booking"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="message">Message</Label>
              <Textarea
                id="message"
                rows={6}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Tell us how we can help…"
              />
            </div>
            <Button type="submit" className="mt-2" disabled={mutation.isPending}>
              {mutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Send className="mr-2 h-4 w-4" />
              )}
              Send message
            </Button>
          </form>

          {ticketsQuery.data && ticketsQuery.data.length > 0 && (
            <div className="mt-8 border-t border-border pt-6">
              <h3 className="font-serif text-base">Your requests</h3>
              <ul className="mt-3 space-y-3">
                {ticketsQuery.data.map((t) => (
                  <li key={t.id} className="rounded-lg border border-border p-3 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-medium">{t.subject}</p>
                      <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                        {STATUS_LABEL[t.status] ?? t.status}
                      </span>
                    </div>
                    <p className="mt-1 text-muted-foreground">{t.message}</p>
                    {t.admin_reply && (
                      <p className="mt-2 rounded-md bg-accent/10 p-2">
                        <span className="font-medium">Support: </span>
                        {t.admin_reply}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        <aside className="rounded-xl border border-border bg-background p-6">
          <div className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-accent" />
            <h2 className="font-serif text-lg">Direct lines</h2>
          </div>
          <ul className="mt-4 space-y-4 text-sm">
            <li>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Membership Enquiries</p>
              <a href="mailto:membership@forevertimeshare.com" className="underline-offset-4 hover:underline">
                membership@forevertimeshare.com
              </a>
            </li>
            <li>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Booking Support</p>
              <a href="mailto:concierge@forevertimeshare.com" className="underline-offset-4 hover:underline">
                concierge@forevertimeshare.com
              </a>
            </li>
            <li>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Owner Services</p>
              <a href="mailto:owners@forevertimeshare.com" className="underline-offset-4 hover:underline">
                owners@forevertimeshare.com
              </a>
            </li>
          </ul>
        </aside>
      </div>
    </PortalPage>
  );
}
