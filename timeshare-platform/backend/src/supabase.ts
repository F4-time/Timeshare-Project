import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { env } from "./env.js";

/**
 * Bypasses RLS. Only use after the caller's identity and permissions have been
 * verified — never derive access decisions from client-supplied values.
 */
export const supabaseAdmin: SupabaseClient = createClient(
  env.SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

/** Client acting as the end user: anon key plus their JWT, so RLS still applies. */
export function supabaseForUser(accessToken: string): SupabaseClient {
  return createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}
