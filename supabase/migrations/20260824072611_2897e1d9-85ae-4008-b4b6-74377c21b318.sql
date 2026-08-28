-- Helper: does the current user manage inventory globally?
CREATE OR REPLACE FUNCTION public.can_manage_inventory(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(_user_id, 'SUPER_ADMIN')
      OR public.has_permission(_user_id, 'inventory.write')
      OR public.has_permission(_user_id, 'bookings.override');
$$;

REVOKE ALL ON FUNCTION public.can_manage_inventory(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_inventory(uuid) TO authenticated;

-- Helper: is this entitlement owned by the current user?
CREATE OR REPLACE FUNCTION public.owns_entitlement(_user_id uuid, _entitlement_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.entitlements e
    LEFT JOIN public.members m ON m.id = e.member_id
    LEFT JOIN public.owners o ON o.id = e.owner_id
    WHERE e.id = _entitlement_id
      AND (m.user_id = _user_id OR o.user_id = _user_id)
  );
$$;

REVOKE ALL ON FUNCTION public.owns_entitlement(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.owns_entitlement(uuid, uuid) TO authenticated;

-- availability: staff-scoped reads only
DROP POLICY IF EXISTS availability_read ON public.availability;
CREATE POLICY availability_staff_read ON public.availability
FOR SELECT TO authenticated
USING (
  public.can_manage_inventory(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.resort_units ru
    WHERE ru.id = availability.resort_unit_id
      AND public.staff_can_access_resort(auth.uid(), ru.resort_id)
  )
);

-- blackouts: staff-scoped reads only
DROP POLICY IF EXISTS blackouts_read ON public.blackouts;
CREATE POLICY blackouts_staff_read ON public.blackouts
FOR SELECT TO authenticated
USING (
  public.can_manage_inventory(auth.uid())
  OR (blackouts.resort_id IS NOT NULL
      AND public.staff_can_access_resort(auth.uid(), blackouts.resort_id))
);

-- buildings: staff-scoped reads only
DROP POLICY IF EXISTS buildings_read ON public.buildings;
CREATE POLICY buildings_staff_read ON public.buildings
FOR SELECT TO authenticated
USING (
  public.can_manage_inventory(auth.uid())
  OR public.staff_can_access_resort(auth.uid(), buildings.resort_id)
);

-- resort_units: staff-scoped reads only
DROP POLICY IF EXISTS units_member_read ON public.resort_units;
CREATE POLICY units_staff_read ON public.resort_units
FOR SELECT TO authenticated
USING (
  public.can_manage_inventory(auth.uid())
  OR public.staff_can_access_resort(auth.uid(), resort_units.resort_id)
);

-- exchange_inventory: owner of the entitlement or staff
DROP POLICY IF EXISTS exchange_inventory_read ON public.exchange_inventory;
CREATE POLICY exchange_inventory_scoped_read ON public.exchange_inventory
FOR SELECT TO authenticated
USING (
  public.can_manage_inventory(auth.uid())
  OR public.owns_entitlement(auth.uid(), exchange_inventory.entitlement_id)
);

-- internal-only admin permission guard should not be callable directly
REVOKE ALL ON FUNCTION public.admin_guard(text) FROM PUBLIC, anon, authenticated;
