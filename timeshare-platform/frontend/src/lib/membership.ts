import { apiPost } from "@/lib/api";
import { supabase } from "@/integrations/supabase/client";

export type PlanBenefitItem = { label: string; detail?: string };

export type MembershipPlanRow = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  currency: string;
  duration_years: number;
  annual_points: number | null;
  annual_nights: number | null;
  maintenance_fee: number | null;
  entitlement_kind: "NIGHTS" | "POINTS";
  booking_window_days: number;
  min_stay_nights: number;
  max_stay_nights: number;
  benefits: { tier?: string; code?: string; perpetual?: boolean; items?: PlanBenefitItem[] } | null;
};

export type LedgerLine = {
  id: string;
  delta: number;
  reason: string;
  notes: string | null;
  created_at: string;
  /** Populated for lines tied to a reservation, so the ledger can show what was booked. */
  booking?: { resortName: string | null; roomTypeName: string | null; totalFees: number } | null;
};

export type MyEntitlement = {
  id: string;
  kind: "NIGHTS" | "POINTS";
  year: number;
  total_units: number;
  balance: number;
  valid_to: string | null;
  ledger: LedgerLine[];
};

export type MyMembership = {
  member: { member_code: string; status: string; joined_at: string } | null;
  contract: {
    contract_number: string;
    status: string;
    start_date: string;
    end_date: string | null;
    price_paid: number;
    plan: MembershipPlanRow | null;
  } | null;
  entitlements: MyEntitlement[];
  /** Sum of `total_fees` across active (non-cancelled) reservations — payable at check-in until online payment goes live. */
  remainingFees: number;
};

/** What was actually booked for each reservation tied to a ledger line — resort, room and fee. */
async function fetchBookingSummaries(
  reservationIds: string[],
): Promise<Map<string, { resortName: string | null; roomTypeName: string | null; totalFees: number }>> {
  const { data } = await supabase
    .from("reservations")
    .select("id, total_fees, resorts(name), reservation_items(room_types(name))")
    .in("id", reservationIds);

  const map = new Map<string, { resortName: string | null; roomTypeName: string | null; totalFees: number }>();
  for (const r of data ?? []) {
    // Untyped embeds come back as arrays even for a to-one/first-item relation.
    const resort = (Array.isArray(r.resorts) ? r.resorts[0] : r.resorts) as { name: string } | null;
    const items = r.reservation_items as unknown as { room_types: { name: string } | { name: string }[] | null }[] | null;
    const roomTypesRaw = items?.[0]?.room_types;
    const roomType = (Array.isArray(roomTypesRaw) ? roomTypesRaw[0] : roomTypesRaw) as { name: string } | null;
    map.set(r.id, {
      resortName: resort?.name ?? null,
      roomTypeName: roomType?.name ?? null,
      totalFees: Number(r.total_fees ?? 0),
    });
  }
  return map;
}

export async function fetchMyMembership(memberId: string | null): Promise<MyMembership> {
  if (!memberId) return { member: null, contract: null, entitlements: [], remainingFees: 0 };

  const { data: member, error: memberError } = await supabase
    .from("members")
    .select("member_code, status, joined_at")
    .eq("id", memberId)
    .maybeSingle();
  if (memberError) throw new Error(memberError.message);

  const { data: contracts, error: contractError } = await supabase
    .from("membership_contracts")
    .select(
      "contract_number, status, start_date, end_date, price_paid, membership_plans(id, name, description, price, currency, duration_years, annual_points, annual_nights, maintenance_fee, entitlement_kind, booking_window_days, min_stay_nights, max_stay_nights, benefits)",
    )
    .eq("member_id", memberId)
    .order("start_date", { ascending: false })
    .limit(1);
  if (contractError) throw new Error(contractError.message);

  const row = contracts?.[0];
  // An untyped client types the embed as an array even though plan_id is many-to-one.
  const embedded = row?.membership_plans as unknown;
  const plan = ((Array.isArray(embedded) ? embedded[0] : embedded) ?? null) as MembershipPlanRow | null;

  const { data: ents, error: entError } = await supabase
    .from("entitlements")
    .select("id, kind, year, total_units, valid_to")
    .eq("member_id", memberId)
    .order("year", { ascending: false });
  if (entError) throw new Error(entError.message);

  // What the member still owes for their stays — fees are payable at check-in until online payment goes live.
  const { data: feeRows } = await supabase
    .from("reservations")
    .select("total_fees")
    .eq("member_id", memberId)
    .neq("status", "cancelled");
  const remainingFees = (feeRows ?? []).reduce((sum, r) => sum + Number(r.total_fees), 0);

  const entitlements: MyEntitlement[] = [];
  for (const e of ents ?? []) {
    const [{ data: balance }, nights, points] = await Promise.all([
      supabase.rpc("entitlement_balance", { _entitlement_id: e.id }),
      supabase
        .from("entitlement_ledger")
        .select("id, delta, reason, notes, created_at, reservation_id")
        .eq("entitlement_id", e.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("points_ledger")
        .select("id, delta, reason, notes, created_at, reservation_id")
        .eq("entitlement_id", e.id)
        .order("created_at", { ascending: false }),
    ]);

    const merged = [...(nights.data ?? []), ...(points.data ?? [])]
      .map((l) => ({ ...l, delta: Number(l.delta) }))
      .sort((a, b) => b.created_at.localeCompare(a.created_at));

    const reservationIds = [...new Set(merged.map((l) => l.reservation_id).filter((id): id is string => Boolean(id)))];
    const bookings = reservationIds.length ? await fetchBookingSummaries(reservationIds) : new Map();

    const ledger: LedgerLine[] = merged.map(({ reservation_id, ...l }) => ({
      ...l,
      booking: reservation_id ? (bookings.get(reservation_id) ?? null) : null,
    }));

    entitlements.push({
      id: e.id,
      kind: e.kind as MyEntitlement["kind"],
      year: e.year,
      total_units: Number(e.total_units),
      balance: Number(balance ?? 0),
      valid_to: e.valid_to,
      ledger,
    });
  }

  return {
    member: member ?? null,
    contract: row
      ? {
          contract_number: row.contract_number,
          status: row.status,
          start_date: row.start_date,
          end_date: row.end_date,
          price_paid: Number(row.price_paid),
          plan: plan
            ? {
                ...plan,
                price: Number(plan.price),
                maintenance_fee: plan.maintenance_fee === null ? null : Number(plan.maintenance_fee),
              }
            : null,
        }
      : null,
    entitlements,
    remainingFees,
  };
}

/** Ledger reasons as a member should read them, not as the database stores them. */
export const REASON_LABEL: Record<string, string> = {
  grant: "Allowance granted",
  hold: "Booking held",
  consume: "Booking completed",
  release: "Returned to you",
  adjustment: "Adjusted by staff",
};

export type EnrollResult = {
  member_id: string;
  contract_id: string;
  entitlement_id: string;
  opening_balance: number;
};

/** Self-service membership enrollment for the signed-in user. */
export function enrollInPlan(planId: string) {
  return apiPost<EnrollResult>("/api/account/enroll", { planId });
}
