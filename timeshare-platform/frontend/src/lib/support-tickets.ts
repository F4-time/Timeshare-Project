import { supabase } from "@/integrations/supabase/client";

/**
 * Member writes go straight to Supabase (RLS: insert own row only); staff reads/updates
 * are gated by the `support.read`/`support.write` permissions on the same table.
 */

export type SupportTicketStatus = "open" | "in_progress" | "resolved";

export type SupportTicket = {
  id: string;
  user_id: string;
  full_name: string | null;
  email: string | null;
  member_code: string | null;
  category: string;
  subject: string;
  message: string;
  status: SupportTicketStatus;
  admin_reply: string | null;
  created_at: string;
  updated_at: string;
};

export type SupportTicketInput = {
  category: string;
  subject: string;
  message: string;
  full_name?: string | null;
  email?: string | null;
  member_code?: string | null;
};

function assertOk(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

export async function createSupportTicket(input: SupportTicketInput): Promise<void> {
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) throw new Error("Not signed in");

  const { error } = await supabase.from("support_tickets").insert({
    user_id: auth.user.id,
    category: input.category,
    subject: input.subject,
    message: input.message,
    full_name: input.full_name ?? null,
    email: input.email ?? null,
    member_code: input.member_code ?? null,
  });
  assertOk(error);
}

export async function listMySupportTickets(): Promise<SupportTicket[]> {
  const { data, error } = await supabase
    .from("support_tickets")
    .select("*")
    .order("created_at", { ascending: false });
  assertOk(error);
  return (data ?? []) as SupportTicket[];
}

export async function listSupportTicketsAdmin(): Promise<SupportTicket[]> {
  const { data, error } = await supabase
    .from("support_tickets")
    .select("*")
    .order("created_at", { ascending: false });
  assertOk(error);
  return (data ?? []) as SupportTicket[];
}

export async function updateSupportTicket(
  id: string,
  patch: { status?: SupportTicketStatus; admin_reply?: string | null },
): Promise<void> {
  const { error } = await supabase.from("support_tickets").update(patch).eq("id", id);
  assertOk(error);
}
