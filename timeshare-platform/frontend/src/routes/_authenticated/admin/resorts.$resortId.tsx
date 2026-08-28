import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ChevronLeft, Loader2, Plus, Trash2 } from "lucide-react";
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
import {
  createUnits,
  deleteUnit,
  getResort,
  listRoomTypes,
  listUnits,
  saveRoomType,
  unitNightCounts,
  type AdminRoomType,
  type RoomTypeInput,
} from "@/lib/admin-inventory";

export const Route = createFileRoute("/_authenticated/admin/resorts/$resortId")({
  head: () => ({ meta: [{ title: "Manage resort — Administration" }] }),
  errorComponent: RouteError,
  pendingComponent: () => <RoutePending label="Loading resort" />,
  component: ManageResortPage,
});

function ManageResortPage() {
  const { resortId } = Route.useParams();

  const resort = useQuery({ queryKey: ["admin-resort", resortId], queryFn: () => getResort(resortId) });
  const roomTypes = useQuery({ queryKey: ["admin-room-types", resortId], queryFn: () => listRoomTypes(resortId) });
  const units = useQuery({ queryKey: ["admin-units", resortId], queryFn: () => listUnits(resortId) });
  const nights = useQuery({ queryKey: ["admin-unit-nights", resortId], queryFn: () => unitNightCounts(resortId) });

  if (resort.isLoading) return <RoutePending label="Loading resort" />;
  if (!resort.data) {
    return (
      <PortalPage title="Resort not found">
        <Button asChild variant="outline">
          <Link to="/admin/resorts">Back to resorts</Link>
        </Button>
      </PortalPage>
    );
  }

  return (
    <PortalPage
      title={resort.data.name}
      description={resort.data.location ?? "Manage room types and units for this resort."}
    >
      <Link
        to="/admin/resorts"
        className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" /> All resorts
      </Link>

      <section className="mb-10">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-serif text-lg">Room types</h2>
            <p className="text-sm text-muted-foreground">
              Capacity and pricing. Points scale with the season; the fee does not.
            </p>
          </div>
          <RoomTypeDialog
            resortId={resortId}
            trigger={
              <Button size="sm">
                <Plus className="mr-2 h-4 w-4" /> Add room type
              </Button>
            }
          />
        </div>

        {roomTypes.isLoading ? (
          <Loader2 className="h-5 w-5 animate-spin text-accent" />
        ) : roomTypes.data?.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            No room types yet. Add one before creating units.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border bg-background">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-muted/40 text-left">
                <tr>
                  <th className="px-4 py-3 font-medium">Code</th>
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Sleeps</th>
                  <th className="px-4 py-3 text-right font-medium">Points / night</th>
                  <th className="px-4 py-3 text-right font-medium">Fee / night</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {roomTypes.data?.map((rt) => (
                  <tr key={rt.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 font-mono text-xs">{rt.code}</td>
                    <td className="px-4 py-3 font-medium">{rt.name}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {rt.max_adults}A / {rt.max_children}C
                    </td>
                    <td className="px-4 py-3 text-right">{rt.base_points_per_night}</td>
                    <td className="px-4 py-3 text-right">₹{rt.base_nightly_fee.toLocaleString("en-IN")}</td>
                    <td className="px-4 py-3 text-right">
                      <RoomTypeDialog
                        resortId={resortId}
                        roomType={rt}
                        trigger={
                          <Button variant="ghost" size="sm">
                            Edit
                          </Button>
                        }
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-serif text-lg">Units</h2>
            <p className="text-sm text-muted-foreground">
              Individual villas. Each gets 12 months of availability automatically.
            </p>
          </div>
          <UnitsDialog
            resortId={resortId}
            roomTypes={roomTypes.data ?? []}
            trigger={
              <Button size="sm" disabled={!roomTypes.data?.length}>
                <Plus className="mr-2 h-4 w-4" /> Add units
              </Button>
            }
          />
        </div>

        {units.isLoading ? (
          <Loader2 className="h-5 w-5 animate-spin text-accent" />
        ) : units.data?.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            No units yet. This resort cannot take bookings until it has at least one.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border bg-background">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-muted/40 text-left">
                <tr>
                  <th className="px-4 py-3 font-medium">Unit</th>
                  <th className="px-4 py-3 font-medium">Room type</th>
                  <th className="px-4 py-3 text-right font-medium">Nights open</th>
                  <th className="px-4 py-3 text-right font-medium">Booked</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {units.data?.map((u) => {
                  const rt = roomTypes.data?.find((t) => t.id === u.room_type_id);
                  const n = nights.data?.get(u.id);
                  return (
                    <tr key={u.id} className="border-b border-border last:border-0">
                      <td className="px-4 py-3 font-mono text-xs">{u.unit_number}</td>
                      <td className="px-4 py-3 text-muted-foreground">{rt?.name ?? "—"}</td>
                      <td className={n && n.available === 0 ? "px-4 py-3 text-right text-destructive" : "px-4 py-3 text-right"}>
                        {n?.available ?? "…"}
                      </td>
                      <td className="px-4 py-3 text-right">{n?.booked ?? "…"}</td>
                      <td className="px-4 py-3 text-right">
                        <DeleteUnitButton unitId={u.id} resortId={resortId} booked={n?.booked ?? 0} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </PortalPage>
  );
}

const EMPTY_RT = {
  code: "",
  name: "",
  description: "",
  max_adults: 2,
  max_children: 2,
  base_points_per_night: 250,
  base_nightly_fee: 3500,
};

function RoomTypeDialog({
  resortId,
  roomType,
  trigger,
}: {
  resortId: string;
  roomType?: AdminRoomType;
  trigger: React.ReactNode;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(
    roomType
      ? {
          code: roomType.code,
          name: roomType.name,
          description: roomType.description ?? "",
          max_adults: roomType.max_adults,
          max_children: roomType.max_children,
          base_points_per_night: roomType.base_points_per_night,
          base_nightly_fee: roomType.base_nightly_fee,
        }
      : EMPTY_RT,
  );

  const mutation = useMutation({
    mutationFn: () => {
      const input: RoomTypeInput = { ...form, resort_id: resortId, id: roomType?.id };
      return saveRoomType(input);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["admin-room-types", resortId] });
      await qc.invalidateQueries({ queryKey: ["admin-resort-counts", resortId] });
      toast.success(roomType ? "Room type updated" : "Room type created");
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const num = (v: string) => (v === "" ? 0 : Number(v));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{roomType ? "Edit room type" : "Add room type"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-[120px_1fr]">
            <div className="space-y-1.5">
              <Label htmlFor="code">Code</Label>
              <Input
                id="code"
                value={form.code}
                disabled={Boolean(roomType)}
                onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
                placeholder="STU"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rt-name">Name</Label>
              <Input
                id="rt-name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Studio Suite"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="rt-desc">Description</Label>
            <Textarea
              id="rt-desc"
              rows={2}
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="adults">Max adults</Label>
              <Input
                id="adults"
                type="number"
                min={1}
                value={form.max_adults}
                onChange={(e) => setForm((f) => ({ ...f, max_adults: num(e.target.value) }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="children">Max children</Label>
              <Input
                id="children"
                type="number"
                min={0}
                value={form.max_children}
                onChange={(e) => setForm((f) => ({ ...f, max_children: num(e.target.value) }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="points">Points / night</Label>
              <Input
                id="points"
                type="number"
                min={0}
                value={form.base_points_per_night}
                onChange={(e) => setForm((f) => ({ ...f, base_points_per_night: num(e.target.value) }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fee">Fee / night (₹)</Label>
              <Input
                id="fee"
                type="number"
                min={0}
                value={form.base_nightly_fee}
                onChange={(e) => setForm((f) => ({ ...f, base_nightly_fee: num(e.target.value) }))}
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            disabled={mutation.isPending || form.code.trim().length < 2 || form.name.trim().length < 2}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function UnitsDialog({
  resortId,
  roomTypes,
  trigger,
}: {
  resortId: string;
  roomTypes: AdminRoomType[];
  trigger: React.ReactNode;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [roomTypeId, setRoomTypeId] = useState("");
  const [count, setCount] = useState(4);
  const [startNumber, setStartNumber] = useState(1);

  const effectiveId = roomTypeId || roomTypes[0]?.id || "";
  const selected = roomTypes.find((r) => r.id === effectiveId);

  const mutation = useMutation({
    mutationFn: () =>
      createUnits({
        resort_id: resortId,
        room_type_id: effectiveId,
        prefix: selected?.code ?? "U",
        count,
        startNumber,
      }),
    onSuccess: async (n) => {
      await qc.invalidateQueries({ queryKey: ["admin-units", resortId] });
      await qc.invalidateQueries({ queryKey: ["admin-unit-nights", resortId] });
      await qc.invalidateQueries({ queryKey: ["admin-resort-counts", resortId] });
      toast.success(n + " unit(s) created with 12 months of availability");
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add units</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="rt">Room type</Label>
            <select
              id="rt"
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={effectiveId}
              onChange={(e) => setRoomTypeId(e.target.value)}
            >
              {roomTypes.map((rt) => (
                <option key={rt.id} value={rt.id}>
                  {rt.code} — {rt.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="count">How many</Label>
              <Input
                id="count"
                type="number"
                min={1}
                max={50}
                value={count}
                onChange={(e) => setCount(Math.min(50, Math.max(1, Number(e.target.value) || 1)))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="start">Starting number</Label>
              <Input
                id="start"
                type="number"
                min={1}
                value={startNumber}
                onChange={(e) => setStartNumber(Math.max(1, Number(e.target.value) || 1))}
              />
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            Creates {selected?.code ?? "U"}-{String(startNumber).padStart(3, "0")} through{" "}
            {selected?.code ?? "U"}-{String(startNumber + count - 1).padStart(3, "0")}.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button disabled={!effectiveId || mutation.isPending} onClick={() => mutation.mutate()}>
            {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteUnitButton({
  unitId,
  resortId,
  booked,
}: {
  unitId: string;
  resortId: string;
  booked: number;
}) {
  const qc = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => deleteUnit(unitId),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["admin-units", resortId] });
      await qc.invalidateQueries({ queryKey: ["admin-unit-nights", resortId] });
      await qc.invalidateQueries({ queryKey: ["admin-resort-counts", resortId] });
      toast.success("Unit removed");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Removing a unit that holds sold nights would orphan real reservations.
  if (booked > 0) {
    return (
      <span className="text-xs text-muted-foreground" title="Has bookings">
        in use
      </span>
    );
  }

  return (
    <Button variant="ghost" size="sm" disabled={mutation.isPending} onClick={() => mutation.mutate()}>
      {mutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
    </Button>
  );
}
