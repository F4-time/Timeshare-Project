-- ====================================================================================================
-- Support tickets: members submit a message from /member/support, staff triage it from /admin/support.
-- ====================================================================================================

CREATE TABLE public.support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text,
  email text,
  member_code text,
  category text NOT NULL DEFAULT 'other',
  subject text NOT NULL,
  message text NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved')),
  admin_reply text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_support_tickets_user ON public.support_tickets(user_id);
CREATE INDEX idx_support_tickets_status ON public.support_tickets(status);

GRANT SELECT, INSERT, UPDATE ON public.support_tickets TO authenticated;
GRANT ALL ON public.support_tickets TO service_role;
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "support_tickets_select" ON public.support_tickets FOR SELECT
  TO authenticated USING (user_id = auth.uid() OR public.has_permission(auth.uid(), 'support.read'));

CREATE POLICY "support_tickets_insert_own" ON public.support_tickets FOR INSERT
  TO authenticated WITH CHECK (user_id = auth.uid());

CREATE POLICY "support_tickets_update_admin" ON public.support_tickets FOR UPDATE
  TO authenticated
  USING (public.has_permission(auth.uid(), 'support.write'))
  WITH CHECK (public.has_permission(auth.uid(), 'support.write'));

CREATE TRIGGER support_tickets_set_updated_at BEFORE UPDATE ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ PERMISSIONS ============
INSERT INTO public.permissions (key, label, perm_group) VALUES
  ('support.read', 'View support tickets', 'support'),
  ('support.write', 'Manage support tickets', 'support')
ON CONFLICT DO NOTHING;

INSERT INTO public.role_permissions (role_key, permission_key) VALUES
  ('ADMIN_STAFF'::public.app_role, 'support.read'),
  ('ADMIN_STAFF'::public.app_role, 'support.write'),
  ('RESORT_STAFF'::public.app_role, 'support.read')
ON CONFLICT DO NOTHING;
