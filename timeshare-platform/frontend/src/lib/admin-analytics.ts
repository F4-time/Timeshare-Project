import { supabase } from "@/integrations/supabase/client";

/** All reads here are RLS-gated: only staff with the right permission see rows. */

async function countOf(table: string, apply?: (q: ReturnType<typeof baseQuery>) => unknown) {
  const q = baseQuery(table);
  if (apply) apply(q);
  const { count, error } = await q;
  if (error) throw new Error(error.message);
  return count ?? 0;
}

function baseQuery(table: string) {
  return supabase.from(table).select("id", { count: "exact", head: true });
}

export type LoginRow = {
  id: string;
  user_id: string;
  login_at: string;
  ip_address: string | null;
  user_agent: string | null;
  profiles: { full_name: string | null; email: string | null } | null;
};

export type Analytics = {
  totalUsers: number;
  totalMembers: number;
  totalOwners: number;
  totalLogins: number;
  uniqueUsersLoggedIn: number;
  loginsLast7Days: number;
  totalResorts: number;
  totalUnits: number;
  bookingsByStatus: Record<string, number>;
  upcomingStays: number;
  feesBooked: number;
  nightsSold: number;
  recentLogins: LoginRow[];
  loginsByDay: { date: string; logins: number }[];
};

export async function fetchAnalytics(): Promise<Analytics> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const today = new Date().toISOString().slice(0, 10);

  const [
    totalUsers,
    totalMembers,
    totalOwners,
    totalResorts,
    totalUnits,
    totalLogins,
    loginsLast7Days,
    upcomingStays,
  ] = await Promise.all([
    countOf("profiles"),
    countOf("members"),
    countOf("owners"),
    countOf("resorts"),
    countOf("resort_units"),
    countOf("login_sessions"),
    (async () => {
      const { count, error } = await supabase
        .from("login_sessions")
        .select("id", { count: "exact", head: true })
        .gte("login_at", sevenDaysAgo);
      if (error) throw new Error(error.message);
      return count ?? 0;
    })(),
    (async () => {
      const { count, error } = await supabase
        .from("reservations")
        .select("id", { count: "exact", head: true })
        .in("status", ["pending", "confirmed"])
        .gte("check_in", today);
      if (error) throw new Error(error.message);
      return count ?? 0;
    })(),
  ]);

  const { data: reservations, error: resError } = await supabase
    .from("reservations")
    .select("status, total_fees, nights, points_used, nights_used");
  if (resError) throw new Error(resError.message);

  const bookingsByStatus: Record<string, number> = {};
  let feesBooked = 0;
  let nightsSold = 0;
  for (const r of reservations ?? []) {
    bookingsByStatus[r.status] = (bookingsByStatus[r.status] ?? 0) + 1;
    // Cancelled stays are excluded so the figures reflect real activity.
    if (r.status !== "cancelled") {
      feesBooked += Number(r.total_fees);
      nightsSold += Number(r.nights);
    }
  }

  // No FK from login_sessions.user_id to public.profiles (it points at auth.users),
  // so PostgREST cannot embed the profile — the names are joined client-side.
  const { data: logins, error: loginError } = await supabase
    .from("login_sessions")
    .select("id, user_id, login_at, ip_address, user_agent")
    .order("login_at", { ascending: false })
    .limit(200);
  if (loginError) throw new Error(loginError.message);

  const rawLogins = (logins ?? []) as Omit<LoginRow, "profiles">[];
  const userIds = [...new Set(rawLogins.map((r) => r.user_id))];

  const profileById = new Map<string, { full_name: string | null; email: string | null }>();
  if (userIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name, email")
      .in("id", userIds);
    for (const p of profiles ?? []) {
      profileById.set(p.id, { full_name: p.full_name, email: p.email });
    }
  }

  const rows: LoginRow[] = rawLogins.map((r) => ({
    ...r,
    profiles: profileById.get(r.user_id) ?? null,
  }));

  const uniqueUsersLoggedIn = new Set(rows.map((r) => r.user_id)).size;

  const byDay = new Map<string, number>();
  for (const r of rows) {
    const day = r.login_at.slice(0, 10);
    byDay.set(day, (byDay.get(day) ?? 0) + 1);
  }
  const loginsByDay = [...byDay.entries()]
    .map(([date, count]) => ({ date, logins: count }))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-14);

  return {
    totalUsers,
    totalMembers,
    totalOwners,
    totalLogins,
    uniqueUsersLoggedIn,
    loginsLast7Days,
    totalResorts,
    totalUnits,
    bookingsByStatus,
    upcomingStays,
    feesBooked,
    nightsSold,
    recentLogins: rows.slice(0, 25),
    loginsByDay,
  };
}

export const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

export function shortAgent(ua: string | null) {
  if (!ua) return "—";
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /Chrome\//.test(ua)
      ? "Chrome"
      : /Safari\//.test(ua)
        ? "Safari"
        : /Firefox\//.test(ua)
          ? "Firefox"
          : "Other";
  const os = /Windows/.test(ua) ? "Windows" : /Mac OS/.test(ua) ? "macOS" : /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iOS" : /Linux/.test(ua) ? "Linux" : "";
  return os ? `${browser} · ${os}` : browser;
}
