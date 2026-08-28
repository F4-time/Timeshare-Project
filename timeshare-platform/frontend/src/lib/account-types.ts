export type AppRole = "MEMBER" | "OWNER" | "RESORT_STAFF" | "ADMIN_STAFF" | "SUPER_ADMIN";

export type Account = {
  userId: string;
  profile: {
    id: string;
    full_name: string | null;
    email: string | null;
    phone: string | null;
    avatar_url: string | null;
    status: string;
    locale: string;
  } | null;
  roles: AppRole[];
  member: { id: string; member_code: string; status: string } | null;
  owner: { id: string; owner_code: string; status: string } | null;
};

export const ADMIN_ROLES: AppRole[] = ["ADMIN_STAFF", "SUPER_ADMIN", "RESORT_STAFF"];

export function hasRole(roles: AppRole[], ...wanted: AppRole[]) {
  return wanted.some((r) => roles.includes(r));
}

export function isAdmin(roles: AppRole[]) {
  return hasRole(roles, ...ADMIN_ROLES);
}

/** Landing portal for a set of roles. */
export function homePortal(roles: AppRole[]) {
  if (isAdmin(roles)) return "/admin/dashboard" as const;
  if (hasRole(roles, "OWNER")) return "/owner/dashboard" as const;
  return "/member/dashboard" as const;
}

export function initialsOf(account: Account | undefined) {
  const name = account?.profile?.full_name ?? account?.profile?.email;
  if (!name) return "FT";
  return name
    .split(/[\s@.]+/)
    .filter(Boolean)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}
