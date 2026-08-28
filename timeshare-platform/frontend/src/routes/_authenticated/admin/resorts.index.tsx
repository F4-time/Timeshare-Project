import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useMutation, useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Loader2, Plus, Pencil } from "lucide-react";
import { toast } from "sonner";

import { PortalPage } from "@/components/portal/PortalShell";
import { RouteError, RoutePending } from "@/components/RouteStates";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { listResortsAdmin, saveResort, type AdminResort, type ResortInput } from "@/lib/admin-inventory";

const resortsQuery = queryOptions({
  queryKey: ["admin-resorts"],
  queryFn: listResortsAdmin,
});

export const Route = createFileRoute("/_authenticated/admin/resorts/")({
  head: () => ({ meta: [{ title: "Resorts — Administration" }] }),
  loader: ({ context }) => context.queryClient.ensureQueryData(resortsQuery),
  errorComponent: RouteError,
  pendingComponent: () => <RoutePending label="Loading resorts" />,
  component: AdminResortsPage,
});

const EMPTY: ResortInput = {
  name: "",
  slug: "",
  location: "",
  country: "India",
  description: "",
  image_url: "",
};

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function ResortDialog({
  resort,
  trigger,
}: {
  resort?: AdminResort;
  trigger: React.ReactNode;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<ResortInput>(
    resort
      ? {
          id: resort.id,
          name: resort.name,
          slug: resort.slug ?? "",
          location: resort.location ?? "",
          country: resort.country ?? "India",
          description: resort.description ?? "",
          image_url: resort.image_url ?? "",
        }
      : EMPTY,
  );

  const mutation = useMutation({
    mutationFn: () => saveResort(form),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["admin-resorts"] });
      await qc.invalidateQueries({ queryKey: ["public-resorts"] });
      toast.success(resort ? "Resort updated" : "Resort created");
      setOpen(false);
      if (!resort) setForm(EMPTY);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const canSave = form.name.trim().length > 1 && form.slug.trim().length > 1;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{resort ? "Edit resort" : "Add resort"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              value={form.name}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  name: e.target.value,
                  // Only auto-fill the slug for new resorts; changing it later breaks links.
                  slug: resort ? f.slug : slugify(e.target.value),
                }))
              }
              placeholder="Lonavala Valley Retreat"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="slug">Slug</Label>
            <Input
              id="slug"
              value={form.slug}
              onChange={(e) => setForm((f) => ({ ...f, slug: slugify(e.target.value) }))}
              placeholder="lonavala"
            />
            <p className="text-xs text-muted-foreground">Used in the public URL. Avoid changing it once published.</p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="location">Location</Label>
              <Input
                id="location"
                value={form.location}
                onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
                placeholder="Lonavala, Maharashtra"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="country">Country</Label>
              <Input
                id="country"
                value={form.country}
                onChange={(e) => setForm((f) => ({ ...f, country: e.target.value }))}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              rows={3}
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="image">Image URL</Label>
            <Input
              id="image"
              value={form.image_url}
              onChange={(e) => setForm((f) => ({ ...f, image_url: e.target.value }))}
              placeholder="https://…"
            />
            <p className="text-xs text-muted-foreground">
              Leave blank to use the bundled artwork matched by slug.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button disabled={!canSave || mutation.isPending} onClick={() => mutation.mutate()}>
            {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {resort ? "Save changes" : "Create resort"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AdminResortsPage() {
  const { data: resorts } = useSuspenseQuery(resortsQuery);

  return (
    <PortalPage
      title="Resorts"
      description="The properties members can book. Each needs room types and units before it can take reservations."
    >
      <div className="mb-4 flex justify-end">
        <ResortDialog
          trigger={
            <Button>
              <Plus className="mr-2 h-4 w-4" /> Add resort
            </Button>
          }
        />
      </div>

      {resorts.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-background p-10 text-center text-sm text-muted-foreground">
          No resorts yet. Add the first one to get started.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-background">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/40 text-left">
              <tr>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="hidden px-4 py-3 font-medium sm:table-cell">Location</th>
                <th className="hidden px-4 py-3 font-medium md:table-cell">Slug</th>
                <th className="px-4 py-3 text-right font-medium">Inventory</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {resorts.map((r) => (
                <tr key={r.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 font-medium">{r.name}</td>
                  <td className="hidden px-4 py-3 text-muted-foreground sm:table-cell">{r.location ?? "—"}</td>
                  <td className="hidden px-4 py-3 text-muted-foreground md:table-cell">{r.slug ?? "—"}</td>
                  <td className="px-4 py-3 text-right">
                    <InventoryCount resortId={r.id} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      <ResortDialog
                        resort={r}
                        trigger={
                          <Button variant="ghost" size="sm">
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        }
                      />
                      <Button variant="outline" size="sm" asChild>
                        <Link to="/admin/resorts/$resortId" params={{ resortId: r.id }}>
                          Manage
                        </Link>
                      </Button>
                    </div>
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

function InventoryCount({ resortId }: { resortId: string }) {
  const { data } = useQuery({
    queryKey: ["admin-resort-counts", resortId],
    queryFn: async () => {
      const { listRoomTypes, listUnits } = await import("@/lib/admin-inventory");
      const [types, units] = await Promise.all([listRoomTypes(resortId), listUnits(resortId)]);
      return { types: types.length, units: units.length };
    },
  });

  if (!data) return <span className="text-muted-foreground">…</span>;
  return (
    <span className={data.units === 0 ? "text-destructive" : "text-muted-foreground"}>
      {data.types} types · {data.units} units
    </span>
  );
}
