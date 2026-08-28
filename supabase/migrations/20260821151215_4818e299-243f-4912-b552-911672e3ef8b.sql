-- 1. Generic audit trigger
CREATE OR REPLACE FUNCTION public.audit_row_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_entity_id uuid;
  v_before jsonb;
  v_after jsonb;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_before := to_jsonb(OLD);
    v_after := NULL;
  ELSIF TG_OP = 'INSERT' THEN
    v_before := NULL;
    v_after := to_jsonb(NEW);
  ELSE
    v_before := to_jsonb(OLD);
    v_after := to_jsonb(NEW);
    IF v_before = v_after THEN
      RETURN NEW;
    END IF;
  END IF;

  BEGIN
    v_entity_id := COALESCE((v_after ->> 'id')::uuid, (v_before ->> 'id')::uuid);
  EXCEPTION WHEN others THEN
    v_entity_id := NULL;
  END;

  INSERT INTO public.audit_logs (actor_id, action, entity_table, entity_id, before, after)
  VALUES (auth.uid(), lower(TG_OP), TG_TABLE_NAME, v_entity_id, v_before, v_after);

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.audit_row_change() FROM PUBLIC;

-- 2. Attach to sensitive tables
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'members','owners','membership_contracts','ownership_contracts','ownership_units',
    'ownership_weeks','ownership_points','entitlements','reservations','reservation_items',
    'cancellations','maintenance_fees','resorts','resort_units','room_types','blackouts',
    'rental_listings','rental_bookings','exchange_requests','user_roles','staff',
    'staff_resorts','system_settings','membership_plans'
  ]
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS audit_%1$s ON public.%1$I', t);
    EXECUTE format(
      'CREATE TRIGGER audit_%1$s AFTER INSERT OR UPDATE OR DELETE ON public.%1$I FOR EACH ROW EXECUTE FUNCTION public.audit_row_change()',
      t
    );
  END LOOP;
END;
$$;

-- 3. Immutability guards on append-only trails
CREATE OR REPLACE FUNCTION public.prevent_row_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'Rows in % are append-only and cannot be % ', TG_TABLE_NAME, lower(TG_OP);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.prevent_row_mutation() FROM PUBLIC;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['entitlement_ledger','points_ledger','payment_transactions','audit_logs','exchange_transactions']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS no_mutate_%1$s ON public.%1$I', t);
    EXECUTE format(
      'CREATE TRIGGER no_mutate_%1$s BEFORE UPDATE OR DELETE ON public.%1$I FOR EACH ROW EXECUTE FUNCTION public.prevent_row_mutation()',
      t
    );
  END LOOP;
END;
$$;

-- 4. Tighten reference-data reads that do not need to be anonymous
DROP POLICY IF EXISTS permissions_read_all ON public.permissions;
CREATE POLICY permissions_read_all ON public.permissions
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS roles_read_all ON public.roles;
CREATE POLICY roles_read_all ON public.roles
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS buildings_public_read ON public.buildings;
CREATE POLICY buildings_read ON public.buildings
  FOR SELECT TO authenticated USING (true);

REVOKE SELECT ON public.permissions FROM anon;
REVOKE SELECT ON public.roles FROM anon;
REVOKE SELECT ON public.buildings FROM anon;
REVOKE SELECT ON public.role_permissions FROM anon;