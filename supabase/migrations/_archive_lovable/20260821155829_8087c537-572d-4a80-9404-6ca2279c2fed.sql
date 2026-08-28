-- 1. Add a write-level finance permission and fix maintenance fee write policy
INSERT INTO public.permissions (key, label, perm_group)
VALUES ('finance.write', 'Manage financial records', 'finance')
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.permissions (key, label, perm_group)
VALUES ('settings.read', 'View system settings', 'settings')
ON CONFLICT (key) DO NOTHING;

DROP POLICY IF EXISTS maintenance_fees_write ON public.maintenance_fees;
CREATE POLICY maintenance_fees_write ON public.maintenance_fees
  FOR ALL TO authenticated
  USING (public.has_permission(auth.uid(), 'finance.write'))
  WITH CHECK (public.has_permission(auth.uid(), 'finance.write'));

-- 2. Restrict the authorization catalog to staff/admins
DROP POLICY IF EXISTS roles_read_all ON public.roles;
CREATE POLICY roles_read_staff ON public.roles
  FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'staff.read') OR public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS permissions_read_all ON public.permissions;
CREATE POLICY permissions_read_staff ON public.permissions
  FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'staff.read') OR public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS role_permissions_read ON public.role_permissions;
CREATE POLICY role_permissions_read_staff ON public.role_permissions
  FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'staff.read') OR public.is_super_admin(auth.uid()));

-- 3. Restrict system settings reads to admins
DROP POLICY IF EXISTS system_settings_read ON public.system_settings;
CREATE POLICY system_settings_read_admin ON public.system_settings
  FOR SELECT TO authenticated
  USING (
    public.has_permission(auth.uid(), 'settings.read')
    OR public.has_permission(auth.uid(), 'settings.write')
    OR public.is_super_admin(auth.uid())
  );

-- 4. Reduce the SECURITY DEFINER surface
-- entitlement_balance previously let any signed-in user read any entitlement balance
CREATE OR REPLACE FUNCTION public.entitlement_balance(_entitlement_id uuid)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_total numeric;
begin
  if not (
    public.owns_entitlement(_entitlement_id)
    or public.has_permission(auth.uid(), 'finance.read')
    or public.has_permission(auth.uid(), 'bookings.read')
    or public.is_super_admin(auth.uid())
  ) then
    raise exception 'Not authorised';
  end if;

  select coalesce((select sum(delta) from public.entitlement_ledger where entitlement_id = _entitlement_id), 0)
       + coalesce((select sum(delta) from public.points_ledger where entitlement_id = _entitlement_id), 0)
    into v_total;
  return v_total;
end;
$function$;

-- Lock execution of every SECURITY DEFINER function to the roles that need it
DO $$
DECLARE
  fn record;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure AS sig, p.proname
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', fn.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn.sig);
    IF fn.proname IN ('handle_new_user', 'audit_row_change', 'prevent_row_mutation') THEN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', fn.sig);
    ELSE
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', fn.sig);
    END IF;
  END LOOP;
END $$;