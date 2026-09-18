import { supabase } from "@/integrations/supabase/client";

export type MemberBooking = {
  id: string;
  reference: string;
  resortName: string | null;
  roomTypeName: string | null;
  checkIn: string;
  checkOut: string;
  nights: number;
  adults: number;
  children: number;
  status: string;
};

export type AdminMemberRow = {
  id: string;
  userId: string;
  memberCode: string;
  status: string;
  joinedAt: string;
  fullName: string | null;
  email: string | null;
  phone: string | null;
  planName: string | null;
  entitlementKind: "NIGHTS" | "POINTS" | null;
  contractStatus: string | null;
  bookings: MemberBooking[];
};

type ContractRow = {
  member_id: string;
  status: string;
  start_date: string;
  membership_plans: { name: string; entitlement_kind: string } | { name: string; entitlement_kind: string }[] | null;
};

type ReservationRow = {
  id: string;
  reference: string;
  member_id: string | null;
  check_in: string;
  check_out: string;
  nights: number;
  adults: number;
  children: number;
  status: string;
  resorts: { name: string } | { name: string }[] | null;
  reservation_items: { room_types: { name: string } | { name: string }[] | null }[] | null;
};

/** Admin-only: lists every member with their current plan and full booking history. RLS requires `members.read`/`bookings.read`. */
export async function fetchAdminMembers(): Promise<AdminMemberRow[]> {
  const { data: members, error: membersError } = await supabase
    .from("members")
    .select("id, user_id, member_code, status, joined_at")
    .order("joined_at", { ascending: false });
  if (membersError) throw new Error(membersError.message);
  if (!members || members.length === 0) return [];

  const memberIds = members.map((m) => m.id);
  const userIds = members.map((m) => m.user_id);

  const [profilesRes, contractsRes, reservationsRes] = await Promise.all([
    supabase.from("profiles").select("id, full_name, email, phone").in("id", userIds),
    supabase
      .from("membership_contracts")
      .select("member_id, status, start_date, membership_plans(name, entitlement_kind)")
      .in("member_id", memberIds)
      .order("start_date", { ascending: false }),
    supabase
      .from("reservations")
      .select(
        "id, reference, member_id, check_in, check_out, nights, adults, children, status, resorts(name), reservation_items(room_types(name))",
      )
      .in("member_id", memberIds)
      .order("check_in", { ascending: false }),
  ]);
  if (profilesRes.error) throw new Error(profilesRes.error.message);
  if (contractsRes.error) throw new Error(contractsRes.error.message);
  if (reservationsRes.error) throw new Error(reservationsRes.error.message);

  // No FK between members/profiles (both point at auth.users), so join client-side.
  const profileByUserId = new Map((profilesRes.data ?? []).map((p) => [p.id, p]));

  // Contracts are ordered by start_date desc, so the first one seen per member is the current one.
  const contractByMemberId = new Map<string, { status: string; plan: { name: string; entitlement_kind: string } | null }>();
  for (const c of (contractsRes.data ?? []) as ContractRow[]) {
    if (contractByMemberId.has(c.member_id)) continue;
    const plan = Array.isArray(c.membership_plans) ? (c.membership_plans[0] ?? null) : c.membership_plans;
    contractByMemberId.set(c.member_id, { status: c.status, plan });
  }

  const bookingsByMemberId = new Map<string, MemberBooking[]>();
  for (const r of (reservationsRes.data ?? []) as ReservationRow[]) {
    if (!r.member_id) continue;
    const resort = Array.isArray(r.resorts) ? (r.resorts[0] ?? null) : r.resorts;
    const roomTypesRaw = r.reservation_items?.[0]?.room_types ?? null;
    const roomType = Array.isArray(roomTypesRaw) ? (roomTypesRaw[0] ?? null) : roomTypesRaw;
    const list = bookingsByMemberId.get(r.member_id) ?? [];
    list.push({
      id: r.id,
      reference: r.reference,
      resortName: resort?.name ?? null,
      roomTypeName: roomType?.name ?? null,
      checkIn: r.check_in,
      checkOut: r.check_out,
      nights: r.nights,
      adults: r.adults,
      children: r.children,
      status: r.status,
    });
    bookingsByMemberId.set(r.member_id, list);
  }

  return members.map((m) => {
    const profile = profileByUserId.get(m.user_id);
    const contract = contractByMemberId.get(m.id);
    return {
      id: m.id,
      userId: m.user_id,
      memberCode: m.member_code,
      status: m.status,
      joinedAt: m.joined_at,
      fullName: profile?.full_name ?? null,
      email: profile?.email ?? null,
      phone: profile?.phone ?? null,
      planName: contract?.plan?.name ?? null,
      entitlementKind: (contract?.plan?.entitlement_kind as "NIGHTS" | "POINTS" | undefined) ?? null,
      contractStatus: contract?.status ?? null,
      bookings: bookingsByMemberId.get(m.id) ?? [],
    };
  });
}
