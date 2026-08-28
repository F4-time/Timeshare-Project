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

export async function listResortsAdmin(): Promise<AdminResort[]> {
  const { data, error } = await supabase
    .from("resorts")
    .select("id, slug, name, description, location, country, image_url")
    .order("name");
  assertOk(error);
  return (data ?? []) as AdminResort[];
}

export async function getResort(id: string): Promise<AdminResort | null> {
  const { data, error } = await supabase
    .from("resorts")
    .select("id, slug, name, description, location, country, image_url")
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
};

export async function saveResort(input: ResortInput) {
  const payload = {
    name: input.name.trim(),
    slug: input.slug.trim().toLowerCase(),
    location: input.location.trim() || null,
    country: input.country.trim() || "India",
    description: input.description.trim() || null,
    image_url: input.image_url.trim() || null,
  };
  const { error } = input.id
    ? await supabase.from("resorts").update(payload).eq("id", input.id)
    : await supabase.from("resorts").insert(payload);
  assertOk(error);
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
