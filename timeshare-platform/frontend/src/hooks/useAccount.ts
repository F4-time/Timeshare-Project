import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { Account, AppRole } from "@/lib/account-types";

/**
 * Client-side equivalent of the reference app's getMyAccount server function.
 * Safe under RLS: profiles, user_roles, members and owners all have self-read policies.
 */
async function fetchAccount(): Promise<Account> {
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) throw new Error("Not signed in");
  const userId = auth.user.id;

  const [profileRes, rolesRes, memberRes, ownerRes] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, full_name, email, phone, avatar_url, status, locale")
      .eq("id", userId)
      .maybeSingle(),
    supabase.from("user_roles").select("role").eq("user_id", userId),
    supabase.from("members").select("id, member_code, status").eq("user_id", userId).maybeSingle(),
    supabase.from("owners").select("id, owner_code, status").eq("user_id", userId).maybeSingle(),
  ]);

  return {
    userId,
    profile: profileRes.data ?? null,
    roles: (rolesRes.data ?? []).map((r) => r.role as AppRole),
    member: memberRes.data ?? null,
    owner: ownerRes.data ?? null,
  };
}

export function useAccount() {
  return useQuery<Account>({
    queryKey: ["account"],
    queryFn: fetchAccount,
    staleTime: 60_000,
    retry: false,
  });
}
