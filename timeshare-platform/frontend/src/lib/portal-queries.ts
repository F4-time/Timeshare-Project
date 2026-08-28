import { supabase } from "@/integrations/supabase/client";

const today = () => new Date().toISOString().slice(0, 10);

/** Each portal metric degrades to a neutral default rather than failing the whole dashboard. */
async function safe<T>(run: () => PromiseLike<T>, fallback: T): Promise<T> {
  try {
    return await run();
  } catch {
    return fallback;
  }
}

export type MemberOverview = {
  entitlementKind: "NIGHTS" | "POINTS" | null;
  entitlementBalance: number;
  upcomingCount: number;
  duesAmount: number;
  documentCount: number;
};

export async function fetchMemberOverview(memberId: string | null): Promise<MemberOverview> {
  const empty: MemberOverview = {
    entitlementKind: null,
    entitlementBalance: 0,
    upcomingCount: 0,
    duesAmount: 0,
    documentCount: 0,
  };
  if (!memberId) return empty;

  const [entitlements, upcoming, fees, documents] = await Promise.all([
    safe(
      async () =>
        (
          await supabase
            .from("entitlements")
            .select("kind, total_units, year")
            .eq("member_id", memberId)
            .order("year", { ascending: false })
        ).data ?? [],
      [] as { kind: string; total_units: number; year: number }[],
    ),
    safe(
      async () =>
        (
          await supabase
            .from("reservations")
            .select("id", { count: "exact", head: true })
            .eq("member_id", memberId)
            .in("status", ["pending", "confirmed"])
            .gte("check_in", today())
        ).count ?? 0,
      0,
    ),
    safe(
      async () =>
        (
          await supabase
            .from("maintenance_fees")
            .select("amount, amount_paid, late_fee")
            .eq("member_id", memberId)
            .in("status", ["pending", "partial", "overdue"])
        ).data ?? [],
      [] as { amount: number; amount_paid: number; late_fee: number }[],
    ),
    safe(
      async () =>
        (
          await supabase
            .from("member_documents")
            .select("id", { count: "exact", head: true })
            .eq("member_id", memberId)
        ).count ?? 0,
      0,
    ),
  ]);

  const year = new Date().getFullYear();
  const current = entitlements.filter((e) => e.year === year);
  const scope = current.length ? current : entitlements.slice(0, 1);

  return {
    entitlementKind: (scope[0]?.kind as MemberOverview["entitlementKind"]) ?? null,
    entitlementBalance: scope.reduce((sum, e) => sum + Number(e.total_units), 0),
    upcomingCount: upcoming,
    duesAmount: fees.reduce(
      (sum, f) => sum + Math.max(0, Number(f.amount) + Number(f.late_fee) - Number(f.amount_paid)),
      0,
    ),
    documentCount: documents,
  };
}

export type OwnerOverview = {
  contractCount: number;
  activeListings: number;
  upcomingCount: number;
  duesAmount: number;
};

export async function fetchOwnerOverview(ownerId: string | null): Promise<OwnerOverview> {
  const empty: OwnerOverview = {
    contractCount: 0,
    activeListings: 0,
    upcomingCount: 0,
    duesAmount: 0,
  };
  if (!ownerId) return empty;

  const [contracts, listings, upcoming, fees] = await Promise.all([
    safe(
      async () =>
        (
          await supabase
            .from("ownership_contracts")
            .select("id", { count: "exact", head: true })
            .eq("owner_id", ownerId)
        ).count ?? 0,
      0,
    ),
    safe(
      async () =>
        (
          await supabase
            .from("rental_listings")
            .select("id", { count: "exact", head: true })
            .eq("owner_id", ownerId)
            .in("status", ["listed", "reserved"])
        ).count ?? 0,
      0,
    ),
    safe(
      async () =>
        (
          await supabase
            .from("reservations")
            .select("id", { count: "exact", head: true })
            .eq("owner_id", ownerId)
            .in("status", ["pending", "confirmed"])
            .gte("check_in", today())
        ).count ?? 0,
      0,
    ),
    safe(
      async () =>
        (
          await supabase
            .from("maintenance_fees")
            .select("amount, amount_paid, late_fee")
            .eq("owner_id", ownerId)
            .in("status", ["pending", "partial", "overdue"])
        ).data ?? [],
      [] as { amount: number; amount_paid: number; late_fee: number }[],
    ),
  ]);

  return {
    contractCount: contracts,
    activeListings: listings,
    upcomingCount: upcoming,
    duesAmount: fees.reduce(
      (sum, f) => sum + Math.max(0, Number(f.amount) + Number(f.late_fee) - Number(f.amount_paid)),
      0,
    ),
  };
}

export type AdminOverview = {
  members: number;
  owners: number;
  resorts: number;
  upcomingReservations: number;
};

export async function fetchAdminOverview(): Promise<AdminOverview> {
  const count = (table: "members" | "owners" | "resorts") =>
    safe(
      async () =>
        (await supabase.from(table).select("id", { count: "exact", head: true })).count ?? 0,
      0,
    );

  const [members, owners, resorts, upcomingReservations] = await Promise.all([
    count("members"),
    count("owners"),
    count("resorts"),
    safe(
      async () =>
        (
          await supabase
            .from("reservations")
            .select("id", { count: "exact", head: true })
            .in("status", ["pending", "confirmed"])
            .gte("check_in", today())
        ).count ?? 0,
      0,
    ),
  ]);

  return { members, owners, resorts, upcomingReservations };
}

export const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});
