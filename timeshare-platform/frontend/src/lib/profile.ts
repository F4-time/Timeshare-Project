import { supabase } from "@/integrations/supabase/client";

export type ProfileUpdate = {
  full_name: string;
  phone: string | null;
};

/** Self-update only — RLS policy `profiles_update_own` scopes this to `auth.uid()`. */
export async function updateProfile(userId: string, patch: ProfileUpdate) {
  const { error } = await supabase
    .from("profiles")
    .update({ full_name: patch.full_name.trim(), phone: patch.phone?.trim() || null })
    .eq("id", userId);
  if (error) throw new Error(error.message);
}

export async function updatePassword(newPassword: string) {
  const { error } = await supabase.auth.updateUser({ password: newPassword.trim() });
  if (error) throw new Error(error.message);
}
