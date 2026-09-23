import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Copy, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";

import { PortalPage } from "@/components/portal/PortalShell";
import { RouteError, RoutePending } from "@/components/RouteStates";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAccount } from "@/hooks/useAccount";
import { createOwner, listOwners, type CreatedOwner } from "@/lib/owner-accounts";

export const Route = createFileRoute("/_authenticated/admin/owners")({
  head: () => ({ meta: [{ title: "Owners — Administration" }] }),
  errorComponent: RouteError,
  pendingComponent: () => <RoutePending label="Loading owners" />,
  component: AdminOwnersPage,
});

function AdminOwnersPage() {
  const { data: account } = useAccount();
  const { data: owners = [], isError, error } = useQuery({ queryKey: ["admin-owners"], queryFn: listOwners });

  return (
    <PortalPage
      title="Owners"
      description="Every listed resort/villa, who owns it, and whether its rooms are currently booked. New resorts can only be added by an admin from the Resorts & Inventory tab."
    >
      {account?.roles.some((role) => role === "ADMIN_STAFF" || role === "SUPER_ADMIN") && (
        <div className="mb-5 flex justify-end">
          <CreateOwnerDialog />
        </div>
      )}
      {isError ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-10 text-center text-sm text-destructive">
          Could not load owner accounts: {error instanceof Error ? error.message : "Please try again."}
        </div>
      ) : owners.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-background p-10 text-center text-sm text-muted-foreground">
          No owner accounts yet. Add an owner to create their login.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-background">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/40 text-left">
              <tr>
                <th className="px-4 py-3 font-medium">Owner</th>
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Resorts</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {owners.map((owner) => (
                <tr key={owner.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3">
                    <div className="font-medium">{owner.name}</div>
                    <div className="text-xs text-muted-foreground">{owner.ownerCode}</div>
                  </td>
                  <td className="px-4 py-3">{owner.email}</td>
                  <td className="px-4 py-3">{owner.resorts.length ? owner.resorts.map((resort) => resort.name).join(", ") : "No resorts assigned"}</td>
                  <td className="px-4 py-3 capitalize text-muted-foreground">{owner.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </PortalPage>
  );
}

function CreateOwnerDialog() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [credentials, setCredentials] = useState<CreatedOwner | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    try {
      const result = await createOwner({
        name: String(form.get("name")).trim(),
        email: String(form.get("email")).trim(),
      });
      setCredentials(result);
      await queryClient.invalidateQueries({ queryKey: ["admin-owners"] });
      toast.success("Owner account created.");
      event.currentTarget.reset();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create owner account.");
    } finally {
      setBusy(false);
    }
  }

  function close(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) setCredentials(null);
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogTrigger asChild>
        <Button><Plus className="mr-2 h-4 w-4" />Add owner</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{credentials ? "Owner login created" : "Add resort owner"}</DialogTitle>
        </DialogHeader>
        {credentials ? (
          <div className="space-y-4 text-sm">
            <p className="text-muted-foreground">Share these credentials securely. The password is shown only here.</p>
            <div className="rounded-lg border border-border bg-muted/40 p-4">
              <p><span className="text-muted-foreground">Name:</span> {credentials.name}</p>
              <p><span className="text-muted-foreground">Email:</span> {credentials.email}</p>
              <p><span className="text-muted-foreground">Password:</span> <strong>{credentials.password}</strong></p>
              <p><span className="text-muted-foreground">Owner code:</span> {credentials.ownerCode}</p>
            </div>
            <Button variant="outline" className="w-full" onClick={() => navigator.clipboard?.writeText(`Email: ${credentials.email}\nPassword: ${credentials.password}`)}>
              <Copy className="mr-2 h-4 w-4" />Copy login details
            </Button>
          </div>
        ) : (
          <form className="space-y-4" onSubmit={submit}>
            <div className="space-y-1.5"><Label htmlFor="owner-name">Owner name</Label><Input id="owner-name" name="name" required /></div>
            <div className="space-y-1.5"><Label htmlFor="owner-email">Email</Label><Input id="owner-email" name="email" type="email" required /></div>
            <p className="text-xs text-muted-foreground">This owner can be assigned to multiple resorts later. Password is generated from the first three letters of the name plus 123.</p>
            <DialogFooter><Button type="submit" disabled={busy}>{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Create owner</Button></DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

