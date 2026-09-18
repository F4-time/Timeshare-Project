import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { PortalPage } from "@/components/portal/PortalShell";
import { RouteError } from "@/components/RouteStates";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { listSupportTicketsAdmin, updateSupportTicket, type SupportTicket } from "@/lib/support-tickets";

export const Route = createFileRoute("/_authenticated/admin/support")({
  head: () => ({ meta: [{ title: "Support — Administration" }] }),
  errorComponent: RouteError,
  component: AdminSupportPage,
});

const STATUS_TONE: Record<string, string> = {
  open: "bg-amber-500/15 text-amber-700",
  in_progress: "bg-accent/15 text-accent",
  resolved: "bg-emerald-500/15 text-emerald-700",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_TONE[status] ?? "bg-muted text-muted-foreground"}`}>
      {status.replace("_", " ")}
    </span>
  );
}

function TicketDialog({ ticket }: { ticket: SupportTicket }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<SupportTicket["status"]>(ticket.status);
  const [reply, setReply] = useState(ticket.admin_reply ?? "");

  const mutation = useMutation({
    mutationFn: () => updateSupportTicket(ticket.id, { status, admin_reply: reply.trim() || null }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["admin-support-tickets"] });
      toast.success("Ticket updated");
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          View
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{ticket.subject}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">From</p>
            <p>
              {ticket.full_name ?? "Unknown"}
              {ticket.email ? ` · ${ticket.email}` : ""}
            </p>
            {ticket.member_code && (
              <p className="text-xs text-muted-foreground">Member {ticket.member_code}</p>
            )}
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Message</p>
            <p className="whitespace-pre-wrap">{ticket.message}</p>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs uppercase tracking-wide text-muted-foreground" htmlFor="status">
              Status
            </label>
            <select
              id="status"
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={status}
              onChange={(e) => setStatus(e.target.value as SupportTicket["status"])}
            >
              <option value="open">Open</option>
              <option value="in_progress">In progress</option>
              <option value="resolved">Resolved</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs uppercase tracking-wide text-muted-foreground" htmlFor="reply">
              Reply to member
            </label>
            <Textarea
              id="reply"
              rows={4}
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              placeholder="Visible to the member on their Support page"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button disabled={mutation.isPending} onClick={() => mutation.mutate()}>
            {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AdminSupportPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-support-tickets"],
    queryFn: listSupportTicketsAdmin,
  });

  if (isLoading) {
    return (
      <PortalPage title="Support">
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-accent" />
        </div>
      </PortalPage>
    );
  }

  if (error) throw error;

  const tickets = data ?? [];

  return (
    <PortalPage title="Support" description="Messages members send from the portal land here.">
      {tickets.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-background p-10 text-center text-sm text-muted-foreground">
          No support requests yet.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-background">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/40 text-left">
              <tr>
                <th className="px-4 py-3 font-medium">Subject</th>
                <th className="hidden px-4 py-3 font-medium sm:table-cell">Name</th>
                <th className="hidden px-4 py-3 font-medium sm:table-cell">Email</th>
                <th className="hidden px-4 py-3 font-medium md:table-cell">Category</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {tickets.map((t) => (
                <tr key={t.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3">
                    <p className="font-medium">{t.subject}</p>
                    <p className="text-xs text-muted-foreground">{new Date(t.created_at).toLocaleString()}</p>
                  </td>
                  <td className="hidden px-4 py-3 sm:table-cell">{t.full_name ?? "—"}</td>
                  <td className="hidden px-4 py-3 text-muted-foreground sm:table-cell">{t.email ?? "—"}</td>
                  <td className="hidden px-4 py-3 capitalize md:table-cell">{t.category}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={t.status} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <TicketDialog ticket={t} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </PortalPage>
  );
}
