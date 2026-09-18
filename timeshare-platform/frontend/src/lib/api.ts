import { supabase } from "@/integrations/supabase/client";

// Trailing slash stripped so `${API_URL}${path}` (path always starts with "/") never
// produces a double slash that Express fails to route (404 instead of a real response).
const API_URL = (import.meta.env.VITE_API_URL ?? "http://localhost:3000").replace(/\/+$/, "");

async function authHeader(): Promise<HeadersInit> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : { "Content-Type": "application/json" };
}

// The deployed backend is sometimes unreachable; without a timeout a hung connection can
// leave callers (e.g. the availability search spinner) waiting a minute or more before
// the browser gives up on its own.
const REQUEST_TIMEOUT_MS = 8_000;

export async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: await authHeader(),
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((json as { error?: string }).error ?? `Request failed (${res.status})`);
  return json as T;
}

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    headers: await authHeader(),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((json as { error?: string }).error ?? `Request failed (${res.status})`);
  return json as T;
}

/**
 * Fire-and-forget: sign-in must succeed even if the audit write does not.
 * Writes straight to Supabase (RLS allows inserting your own row) instead of going through
 * the backend's /api/account/login-event — that endpoint is on a separately deployed server
 * that isn't always reachable, which silently dropped every login from "Recent sign-ins".
 */
export function recordLogin() {
  supabase.auth
    .getUser()
    .then(({ data }) => {
      const userId = data.user?.id;
      if (!userId) return;
      return supabase
        .from("login_sessions")
        .insert({ user_id: userId, user_agent: navigator.userAgent.slice(0, 500) });
    })
    .catch((err) => {
      console.warn("Could not record login", err);
    });
}
