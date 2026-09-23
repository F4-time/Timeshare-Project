import { supabase } from "@/integrations/supabase/client";

/**
 * Admin writes go straight to Supabase rather than through the API: RLS already
 * restricts these tables to `inventory.write`, so a server hop would add nothing.
 * Anything needing the service role or a transaction goes through the backend.
 */

export type AdminResort = {
  id: string;
  slug: string | null;
  name: string;
  description: string | null;
  location: string | null;
  country: string | null;
  image_url: string | null;
  /** Extra photos beyond the cover `image_url`, shown as a gallery on the property page. */
  gallery: string[] | null;
  amenities: { items?: string[] } | null;
  /** Contact details for the party who owns this resort/villa — admin-only, never shown publicly. */
  owner_name: string | null;
  owner_phone: string | null;
  owner_email: string | null;
};

export type AdminRoomType = {
  id: string;
  resort_id: string;
  code: string;
  name: string;
  description: string | null;
  max_adults: number;
  max_children: number;
  base_points_per_night: number;
  base_nightly_fee: number;
};

export type AdminUnit = {
  id: string;
  resort_id: string;
  room_type_id: string;
  unit_number: string;
  floor: number | null;
  status: string;
};

function assertOk(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

const ADMIN_RESORT_COLUMNS =
  "id, slug, name, description, location, country, image_url, gallery, amenities, owner_name, owner_phone, owner_email";

export async function listResortsAdmin(): Promise<AdminResort[]> {
  const { data, error } = await supabase
    .from("resorts")
    .select(ADMIN_RESORT_COLUMNS)
    .neq("name", "Flora Ecostay Lonavala")
    .order("name");
  assertOk(error);
  return (data ?? []) as AdminResort[];
}

export async function getResort(id: string): Promise<AdminResort | null> {
  const { data, error } = await supabase
    .from("resorts")
    .select(ADMIN_RESORT_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  assertOk(error);
  return (data as AdminResort) ?? null;
}

export type ResortInput = {
  id?: string;
  name: string;
  slug: string;
  location: string;
  country: string;
  description: string;
  image_url: string;
  /** Extra photos beyond the cover `image_url`. */
  gallery: string[];
  /** Comma-separated list; split into the `amenities.items` JSON array on save. */
  amenities: string;
  owner_name: string;
  owner_phone: string;
  owner_email: string;
  ownerId: string;
};

export async function saveResort(input: ResortInput) {
  const amenityItems = input.amenities
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const payload = {
    name: input.name.trim(),
    slug: input.slug.trim().toLowerCase(),
    location: input.location.trim() || null,
    country: input.country.trim() || "India",
    description: input.description.trim() || null,
    image_url: input.image_url.trim() || null,
    gallery: input.gallery.filter(Boolean),
    amenities: { items: amenityItems },
    owner_name: input.owner_name.trim() || null,
    owner_phone: input.owner_phone.trim() || null,
    owner_email: input.owner_email.trim() || null,
  };
  const resortResult = input.id
    ? await supabase.from("resorts").update(payload).eq("id", input.id).select("id").single()
    : await supabase.from("resorts").insert(payload).select("id").single();
  const { data: resort, error } = resortResult;
  assertOk(error);
  if (!resort) throw new Error("Could not save resort");

  const { error: clearLinksError } = await supabase.from("owner_resorts").delete().eq("resort_id", resort.id);
  assertOk(clearLinksError);
  if (input.ownerId) {
    const { error: linkError } = await supabase
      .from("owner_resorts")
      .insert({ owner_id: input.ownerId, resort_id: resort.id });
    assertOk(linkError);
  }
}

/** Uploads an image to the public `resort-images` bucket and returns its public URL. */
export async function uploadResortImage(file: File, slug: string): Promise<string> {
  const ext = file.name.split(".").pop() || "jpg";
  const path = `${slug || "resort"}/${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from("resort-images").upload(path, file, {
    cacheControl: "3600",
    upsert: true,
  });
  assertOk(error);
  const { data } = supabase.storage.from("resort-images").getPublicUrl(path);
  return data.publicUrl;
}

export async function listRoomTypes(resortId: string): Promise<AdminRoomType[]> {
  const { data, error } = await supabase
    .from("room_types")
    .select("id, resort_id, code, name, description, max_adults, max_children, base_points_per_night, base_nightly_fee")
    .eq("resort_id", resortId)
    .order("code");
  assertOk(error);
  return (data ?? []).map((r) => ({
    ...r,
    base_points_per_night: Number(r.base_points_per_night),
    base_nightly_fee: Number(r.base_nightly_fee),
  })) as AdminRoomType[];
}

export type RoomTypeInput = {
  id?: string;
  resort_id: string;
  code: string;
  name: string;
  description: string;
  max_adults: number;
  max_children: number;
  base_points_per_night: number;
  base_nightly_fee: number;
};

export async function saveRoomType(input: RoomTypeInput) {
  const payload = {
    resort_id: input.resort_id,
    code: input.code.trim().toUpperCase(),
    name: input.name.trim(),
    description: input.description.trim() || null,
    max_adults: input.max_adults,
    max_children: input.max_children,
    base_points_per_night: input.base_points_per_night,
    base_nightly_fee: input.base_nightly_fee,
  };
  const { error } = input.id
    ? await supabase.from("room_types").update(payload).eq("id", input.id)
    : await supabase.from("room_types").insert(payload);
  assertOk(error);
}

export async function listUnits(resortId: string): Promise<AdminUnit[]> {
  const { data, error } = await supabase
    .from("resort_units")
    .select("id, resort_id, room_type_id, unit_number, floor, status")
    .eq("resort_id", resortId)
    .order("unit_number");
  assertOk(error);
  return (data ?? []) as AdminUnit[];
}

/** A trigger fills 12 months of availability for each new unit. */
export async function createUnits(input: {
  resort_id: string;
  room_type_id: string;
  prefix: string;
  count: number;
  startNumber: number;
}) {
  const rows = Array.from({ length: input.count }, (_, i) => ({
    resort_id: input.resort_id,
    room_type_id: input.room_type_id,
    unit_number: `${input.prefix.trim().toUpperCase()}-${String(input.startNumber + i).padStart(3, "0")}`,
    status: "active",
  }));
  const { error } = await supabase.from("resort_units").insert(rows);
  assertOk(error);
  return rows.length;
}

export async function deleteUnit(id: string) {
  const { error } = await supabase.from("resort_units").delete().eq("id", id);
  assertOk(error);
}

/** Nights already sold cannot be removed, so this reports rather than assumes. */
export async function unitNightCounts(resortId: string) {
  const { data, error } = await supabase
    .from("resort_units")
    .select("id, availability(status)")
    .eq("resort_id", resortId);
  assertOk(error);

  const counts = new Map<string, { available: number; booked: number }>();
  for (const u of (data ?? []) as { id: string; availability: { status: string }[] }[]) {
    const available = u.availability?.filter((a) => a.status === "available").length ?? 0;
    const booked = u.availability?.filter((a) => a.status === "booked").length ?? 0;
    counts.set(u.id, { available, booked });
  }
  return counts;
}

/** Snapshot of a resort's rooms right now, for the admin Owners tab ("is his room booked or not"). */
export async function getResortOccupancy(resortId: string): Promise<{ bookedUnits: number; totalUnits: number }> {
  const units = await listUnits(resortId);
  if (units.length === 0) return { bookedUnits: 0, totalUnits: 0 };

  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from("availability")
    .select("resort_unit_id")
    .eq("stay_date", today)
    .eq("status", "booked")
    .in(
      "resort_unit_id",
      units.map((u) => u.id),
    );
  assertOk(error);

  const bookedUnitIds = new Set((data ?? []).map((row) => row.resort_unit_id as string));
  return { bookedUnits: bookedUnitIds.size, totalUnits: units.length };
}
