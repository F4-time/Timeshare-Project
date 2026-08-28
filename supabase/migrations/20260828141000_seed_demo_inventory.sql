-- ====================================================================================================
-- Demo inventory: room types, units, seasons and a rolling year of availability.
--
-- Idempotent - safe to re-run. Gives the booking engine something real to search
-- against. Replace with genuine inventory before going live.
-- ====================================================================================================

-- ============ ROOM TYPES: two per resort ============
INSERT INTO public.room_types
  (resort_id, code, name, description, max_adults, max_children, base_points_per_night, base_nightly_fee)
SELECT r.id, t.code, t.name, t.description, t.max_adults, t.max_children, t.points, t.fee
FROM public.resorts r
CROSS JOIN (VALUES
  ('STU', 'Studio Suite',    'Open-plan suite with a kitchenette and private balcony.', 2, 1, 250::numeric, 3500::numeric),
  ('1BR', 'One-Bedroom Villa','Separate bedroom, living room and a private sit-out.',   4, 2, 420::numeric, 6200::numeric)
) AS t(code, name, description, max_adults, max_children, points, fee)
ON CONFLICT (resort_id, code) DO NOTHING;

-- ============ UNITS: four per room type ============
INSERT INTO public.resort_units (resort_id, room_type_id, unit_number, floor, status)
SELECT rt.resort_id,
       rt.id,
       rt.code || '-' || LPAD(n::text, 3, '0'),
       ((n - 1) / 2) + 1,
       'active'
FROM public.room_types rt
CROSS JOIN generate_series(1, 4) AS n
ON CONFLICT (resort_id, unit_number) DO NOTHING;

-- ============ SEASONS: peak / shoulder / off for the next 12 months ============
INSERT INTO public.seasons (resort_id, name, start_date, end_date, points_multiplier)
SELECT r.id, s.name, s.start_date, s.end_date, s.multiplier
FROM public.resorts r
CROSS JOIN (VALUES
  ('Peak',     date_trunc('month', current_date)::date,
               (date_trunc('month', current_date) + interval '2 months - 1 day')::date, 1.500::numeric),
  ('Shoulder', (date_trunc('month', current_date) + interval '2 months')::date,
               (date_trunc('month', current_date) + interval '6 months - 1 day')::date, 1.000::numeric),
  ('Off',      (date_trunc('month', current_date) + interval '6 months')::date,
               (date_trunc('month', current_date) + interval '12 months - 1 day')::date, 0.750::numeric)
) AS s(name, start_date, end_date, multiplier)
WHERE NOT EXISTS (
  SELECT 1 FROM public.seasons ex WHERE ex.resort_id = r.id AND ex.name = s.name
);

-- ============ AVAILABILITY: one row per unit per night for the next 12 months ============
INSERT INTO public.availability (resort_unit_id, stay_date, status)
SELECT u.id, d::date, 'available'::public.inventory_status
FROM public.resort_units u
CROSS JOIN generate_series(current_date, current_date + interval '12 months', interval '1 day') AS d
ON CONFLICT (resort_unit_id, stay_date) DO NOTHING;
