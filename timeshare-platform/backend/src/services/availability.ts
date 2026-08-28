import { supabaseAdmin } from "../supabase.js";
import { HttpError } from "../middleware/error.js";

export type AvailabilityQuery = {
  resortId: string;
  checkIn: string;
  checkOut: string;
  adults: number;
  children: number;
};

export type RoomOption = {
  roomTypeId: string;
  code: string;
  name: string;
  description: string | null;
  maxAdults: number;
  maxChildren: number;
  unitsAvailable: number;
  points: number;
  fee: number;
};

/** Occupied nights: check-out day is not slept in, so it is excluded. */
export function nightsBetween(checkIn: string, checkOut: string): string[] {
  const nights: string[] = [];
  const end = new Date(`${checkOut}T00:00:00Z`);
  for (let d = new Date(`${checkIn}T00:00:00Z`); d < end; d.setUTCDate(d.getUTCDate() + 1)) {
    nights.push(d.toISOString().slice(0, 10));
  }
  return nights;
}

type Season = { start_date: string; end_date: string; points_multiplier: number };

/** Seasons are inclusive ranges; nights outside every season price at 1.0. */
function multiplierFor(night: string, seasons: Season[]): number {
  const season = seasons.find((s) => night >= s.start_date && night <= s.end_date);
  return season ? Number(season.points_multiplier) : 1;
}

/**
 * Reads inventory with the service role because resort_units and availability are
 * staff-only under RLS — a guest must never query raw inventory, only the
 * computed result of this search.
 */
export async function searchAvailability(q: AvailabilityQuery) {
  const nights = nightsBetween(q.checkIn, q.checkOut);
  if (nights.length === 0) throw new HttpError(400, "Check-out must be after check-in");

  const { data: resort, error: resortError } = await supabaseAdmin
    .from("resorts")
    .select("id, name, slug, location")
    .eq("id", q.resortId)
    .maybeSingle();
  if (resortError) throw new HttpError(500, resortError.message);
  if (!resort) throw new HttpError(404, "Resort not found");

  const { data: roomTypes, error: rtError } = await supabaseAdmin
    .from("room_types")
    .select("id, code, name, description, max_adults, max_children, base_points_per_night, base_nightly_fee")
    .eq("resort_id", q.resortId)
    .gte("max_adults", q.adults)
    .gte("max_children", q.children);
  if (rtError) throw new HttpError(500, rtError.message);
  if (!roomTypes?.length) return { resort, nights: nights.length, checkIn: q.checkIn, checkOut: q.checkOut, options: [] };

  const roomTypeIds = roomTypes.map((rt) => rt.id);

  // A blackout on the resort (room_type_id null) removes every room type.
  const { data: blackouts } = await supabaseAdmin
    .from("blackouts")
    .select("room_type_id")
    .or(`resort_id.eq.${q.resortId},room_type_id.in.(${roomTypeIds.join(",")})`)
    .lte("start_date", nights[nights.length - 1]!)
    .gte("end_date", nights[0]!);

  const blackedOutTypes = new Set<string>();
  let resortWideBlackout = false;
  for (const b of blackouts ?? []) {
    if (b.room_type_id === null) resortWideBlackout = true;
    else blackedOutTypes.add(b.room_type_id as string);
  }
  if (resortWideBlackout) {
    return { resort, nights: nights.length, checkIn: q.checkIn, checkOut: q.checkOut, options: [] };
  }

  const { data: units, error: unitError } = await supabaseAdmin
    .from("resort_units")
    .select("id, room_type_id")
    .eq("resort_id", q.resortId)
    .eq("status", "active")
    .in("room_type_id", roomTypeIds);
  if (unitError) throw new HttpError(500, unitError.message);
  if (!units?.length) return { resort, nights: nights.length, checkIn: q.checkIn, checkOut: q.checkOut, options: [] };

  const { data: availableRows, error: availError } = await supabaseAdmin
    .from("availability")
    .select("resort_unit_id, stay_date")
    .in("resort_unit_id", units.map((u) => u.id))
    .in("stay_date", nights)
    .eq("status", "available");
  if (availError) throw new HttpError(500, availError.message);

  // A unit qualifies only if it is free on every requested night.
  const freeNightCount = new Map<string, number>();
  for (const row of availableRows ?? []) {
    freeNightCount.set(row.resort_unit_id, (freeNightCount.get(row.resort_unit_id) ?? 0) + 1);
  }
  const fullyFree = units.filter((u) => freeNightCount.get(u.id) === nights.length);

  const { data: seasons } = await supabaseAdmin
    .from("seasons")
    .select("start_date, end_date, points_multiplier")
    .eq("resort_id", q.resortId);

  const options: RoomOption[] = roomTypes
    .filter((rt) => !blackedOutTypes.has(rt.id))
    .map((rt) => {
      const unitsAvailable = fullyFree.filter((u) => u.room_type_id === rt.id).length;
      const points = nights.reduce(
        (sum, night) => sum + Number(rt.base_points_per_night) * multiplierFor(night, (seasons ?? []) as Season[]),
        0,
      );
      return {
        roomTypeId: rt.id,
        code: rt.code,
        name: rt.name,
        description: rt.description,
        maxAdults: rt.max_adults,
        maxChildren: rt.max_children,
        unitsAvailable,
        points: Math.round(points * 100) / 100,
        fee: Math.round(Number(rt.base_nightly_fee) * nights.length * 100) / 100,
      };
    })
    .filter((o) => o.unitsAvailable > 0);

  return { resort, nights: nights.length, checkIn: q.checkIn, checkOut: q.checkOut, options };
}
