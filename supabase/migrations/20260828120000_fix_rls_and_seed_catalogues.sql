-- ====================================================================================================
-- Fix RLS gaps left by MIGRATION_READY_CLEAN.sql and seed the public catalogues.
--
-- MIGRATION_READY_CLEAN.sql enabled RLS on resorts, membership_plans, entitlements,
-- entitlement_ledger, points_ledger and audit_logs but created no SELECT policies.
-- RLS denies by default, so those tables were unreadable by every client, including
-- signed-in users. This adds the missing policies and seeds the public catalogues.
-- ====================================================================================================

-- ============ PUBLIC CATALOGUE READS ============
-- Resorts and plans drive the public marketing pages, so anon may read them.

DROP POLICY IF EXISTS "resorts_read_all" ON public.resorts;
CREATE POLICY "resorts_read_all" ON public.resorts FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "membership_plans_read_active" ON public.membership_plans;
CREATE POLICY "membership_plans_read_active" ON public.membership_plans FOR SELECT
  TO anon, authenticated USING (active OR public.is_super_admin(auth.uid()));

-- Staff need to manage the catalogue from the admin portal.
DROP POLICY IF EXISTS "resorts_write_admin" ON public.resorts;
CREATE POLICY "resorts_write_admin" ON public.resorts FOR ALL
  TO authenticated
  USING (public.has_permission(auth.uid(), 'inventory.write'))
  WITH CHECK (public.has_permission(auth.uid(), 'inventory.write'));

DROP POLICY IF EXISTS "membership_plans_write_admin" ON public.membership_plans;
CREATE POLICY "membership_plans_write_admin" ON public.membership_plans FOR ALL
  TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

-- ============ ENTITLEMENTS (own rows only) ============
-- MIGRATION_READY_CLEAN.sql does not define current_member_id()/current_owner_id(),
-- so these policies resolve ownership inline.

DROP POLICY IF EXISTS "entitlements_select_own" ON public.entitlements;
CREATE POLICY "entitlements_select_own" ON public.entitlements FOR SELECT
  TO authenticated USING (
    public.is_super_admin(auth.uid())
    OR member_id IN (SELECT id FROM public.members WHERE user_id = auth.uid())
    OR owner_id  IN (SELECT id FROM public.owners  WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "entitlement_ledger_select_own" ON public.entitlement_ledger;
CREATE POLICY "entitlement_ledger_select_own" ON public.entitlement_ledger FOR SELECT
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.entitlements e
      WHERE e.id = entitlement_id
        AND (
          public.is_super_admin(auth.uid())
          OR e.member_id IN (SELECT id FROM public.members WHERE user_id = auth.uid())
          OR e.owner_id  IN (SELECT id FROM public.owners  WHERE user_id = auth.uid())
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
          OR e.member_id IN (SELECT id FROM public.members WHERE user_id = auth.uid())
          OR e.owner_id  IN (SELECT id FROM public.owners  WHERE user_id = auth.uid())
        )
    )
  );

-- ============ AUDIT LOG (read-only, privileged) ============
DROP POLICY IF EXISTS "audit_logs_select_admin" ON public.audit_logs;
CREATE POLICY "audit_logs_select_admin" ON public.audit_logs FOR SELECT
  TO authenticated USING (public.has_permission(auth.uid(), 'audit.read'));

-- ============ SEED: RESORTS ============
INSERT INTO public.resorts (slug, name, description, location, country, coordinates, amenities) VALUES
  ('lonavala', 'Lonavala Valley Retreat',
   'Mist-covered ridges, green valleys and peaceful hillside stays close to Mumbai.',
   'Lonavala, Maharashtra', 'India',
   '{"lat": 18.7546, "lng": 73.4062}'::jsonb,
   '{"items": ["Infinity pool", "Valley-view suites", "Spa", "Kids club"]}'::jsonb),
  ('karjat', 'Karjat Riverside Villas',
   'A quiet riverside retreat framed by tropical gardens and the Sahyadri foothills.',
   'Karjat, Maharashtra', 'India',
   '{"lat": 18.9107, "lng": 73.3233}'::jsonb,
   '{"items": ["Private villas", "River deck", "Outdoor dining", "Trekking"]}'::jsonb),
  ('igatpuri', 'Igatpuri Lake House',
   'Calm lake views, dramatic mountain scenery and cool-weather escapes.',
   'Igatpuri, Maharashtra', 'India',
   '{"lat": 19.6967, "lng": 73.5626}'::jsonb,
   '{"items": ["Lakefront rooms", "Yoga pavilion", "Bonfire lawn"]}'::jsonb),
  ('mahabaleshwar', 'Mahabaleshwar Sunrise Estate',
   'Wake to sweeping valley sunrises in Maharashtra''s celebrated hill country.',
   'Mahabaleshwar, Maharashtra', 'India',
   '{"lat": 17.9307, "lng": 73.6477}'::jsonb,
   '{"items": ["Sunrise terrace", "Strawberry farm", "Heated pool"]}'::jsonb),
  ('alibaug', 'Alibaug Palm Beach Resort',
   'Palm-lined shores, warm coastal air and relaxed beachside living.',
   'Alibaug, Maharashtra', 'India',
   '{"lat": 18.6414, "lng": 72.8722}'::jsonb,
   '{"items": ["Beach access", "Water sports", "Seafood grill"]}'::jsonb),
  ('murud', 'Murud Sea Fort Residences',
   'An unhurried Konkan coastline overlooking the historic Murud-Janjira sea fort.',
   'Murud, Maharashtra', 'India',
   '{"lat": 18.3280, "lng": 72.9631}'::jsonb,
   '{"items": ["Fort views", "Coastal walks", "Ayurvedic spa"]}'::jsonb)
ON CONFLICT (slug) DO NOTHING;

-- ============ SEED: MEMBERSHIP PLANS ============
-- Mirrors timeshare-platform/frontend/src/data/plans.ts so the static and live
-- catalogues agree once the frontend is wired to the database.
-- membership_plans has no unique key on name, so guard on NOT EXISTS to stay idempotent.
INSERT INTO public.membership_plans
  (name, description, price, currency, duration_years, annual_points, annual_nights, maintenance_fee, benefits, active)
SELECT v.name, v.description, v.price, v.currency, v.duration_years,
       v.annual_points, v.annual_nights, v.maintenance_fee, v.benefits, v.active
FROM (VALUES
  ('Silver Escape', 'Entry tier with fixed annual nights across our domestic estates.',
   295000::numeric, 'INR', 10, NULL::int, 7::numeric, 18000::numeric,
   '{"cadence": "Daily", "tagline": "Night-by-night getaways", "tier": "Silver", "code": "SILVER", "booking_window_days": 180, "items": [
      {"label": "7 nights every year", "detail": "Studio and one-bedroom units across our domestic estates"},
      {"label": "6-month booking window", "detail": "Reserve up to 180 days ahead of your stay"},
      {"label": "Family of four included", "detail": "Two adults and two children on every stay"}]}'::jsonb,
   true),
  ('Gold Retreat', 'Domestic plus select international stays with flexible splitting.',
   545000::numeric, 'INR', 15, NULL::int, 14::numeric, 26000::numeric,
   '{"cadence": "Weekly", "tagline": "Full-week family holidays", "tier": "Gold", "code": "GOLD", "booking_window_days": 270, "items": [
      {"label": "14 nights every year", "detail": "One and two-bedroom suites, domestic plus select international"},
      {"label": "9-month booking window", "detail": "Reserve up to 270 days ahead for peak season"},
      {"label": "Split your stays", "detail": "Use your nights across multiple trips each year"}]}'::jsonb,
   true),
  ('Platinum Points', 'Points-based flexibility across seasons, room types and destinations.',
   895000::numeric, 'INR', 25, 30000, NULL::numeric, 38000::numeric,
   '{"cadence": "Monthly", "tagline": "Extended monthly stays", "tier": "Platinum", "code": "PLATINUM", "booking_window_days": 365, "items": [
      {"label": "30,000 points a year", "detail": "Spend across seasons, room types and destinations"},
      {"label": "12-month booking window", "detail": "First access to festive and peak inventory"},
      {"label": "Exchange and rental access", "detail": "Deposit unused points or list your week"}]}'::jsonb,
   true),
  ('Signature Residence', 'Residence-grade inventory with perpetual tenure and concierge.',
   1750000::numeric, 'INR', 99, 60000, NULL::numeric, 62000::numeric,
   '{"cadence": "Yearly", "tagline": "The full-year legacy membership", "tier": "Signature", "code": "SIGNATURE", "booking_window_days": 365, "perpetual": true, "items": [
      {"label": "60,000 points a year", "detail": "Residence-grade inventory and private villas"},
      {"label": "Perpetual membership", "detail": "No fixed term - pass it on to your family"},
      {"label": "Dedicated concierge", "detail": "Personal holiday planner and in-resort host"}]}'::jsonb,
   true)
) AS v(name, description, price, currency, duration_years, annual_points, annual_nights, maintenance_fee, benefits, active)
WHERE NOT EXISTS (SELECT 1 FROM public.membership_plans p WHERE p.name = v.name);
