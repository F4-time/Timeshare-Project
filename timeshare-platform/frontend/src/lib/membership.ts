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
};

export async function fetchMyMembership(memberId: string | null): Promise<MyMembership> {
  if (!memberId) return { member: null, contract: null, entitlements: [] };

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

  const entitlements: MyEntitlement[] = [];
  for (const e of ents ?? []) {
    const [{ data: balance }, nights, points] = await Promise.all([
      supabase.rpc("entitlement_balance", { _entitlement_id: e.id }),
      supabase
        .from("entitlement_ledger")
        .select("id, delta, reason, notes, created_at")
        .eq("entitlement_id", e.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("points_ledger")
        .select("id, delta, reason, notes, created_at")
        .eq("entitlement_id", e.id)
        .order("created_at", { ascending: false }),
    ]);

    const ledger = [...(nights.data ?? []), ...(points.data ?? [])]
      .map((l) => ({ ...l, delta: Number(l.delta) }))
      .sort((a, b) => b.created_at.localeCompare(a.created_at));

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
