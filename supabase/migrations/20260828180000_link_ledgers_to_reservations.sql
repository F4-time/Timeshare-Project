-- ====================================================================================================
-- Link ledger lines to the reservation that caused them.
--
-- The clean-start baseline created entitlement_ledger and points_ledger without a
-- reservation_id column, so book_stay failed with 42703 when writing the hold.
--
-- Adding the column rather than dropping it from the function: without it a member
-- can see that 3 nights left their balance but not which booking took them, which
-- defeats the point of keeping a ledger.
-- ====================================================================================================

ALTER TABLE public.entitlement_ledger
  ADD COLUMN IF NOT EXISTS reservation_id uuid REFERENCES public.reservations(id) ON DELETE SET NULL;

ALTER TABLE public.points_ledger
  ADD COLUMN IF NOT EXISTS reservation_id uuid REFERENCES public.reservations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS entitlement_ledger_reservation_idx
  ON public.entitlement_ledger (reservation_id);
CREATE INDEX IF NOT EXISTS points_ledger_reservation_idx
  ON public.points_ledger (reservation_id);

-- The baseline enabled RLS on both ledgers but never added policies, so they were
-- unreadable. A member should be able to see the history behind their own balance.
DROP POLICY IF EXISTS "entitlement_ledger_select_own" ON public.entitlement_ledger;
CREATE POLICY "entitlement_ledger_select_own" ON public.entitlement_ledger FOR SELECT
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.entitlements e
      WHERE e.id = entitlement_id
        AND (
          public.is_super_admin(auth.uid())
          OR e.member_id = public.current_member_id()
          OR e.owner_id = public.current_owner_id()
        )
    )
  );

DROP POLICY IF EXISTS "points_ledger_select_own" ON public.points_ledger;
CREATE POLICY "points_ledger_select_own" ON public.points_ledger FOR SELECT
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.entitlements e
      WHERE e.id = entitlement_id
        AND (
          public.is_super_admin(auth.uid())
          OR e.member_id = public.current_member_id()
          OR e.owner_id = public.current_owner_id()
        )
    )
  );
