-- ====================================================================================================
-- Seed the Vasind resort. The home page always listed a "Vasind" destination card, but no
-- matching row existed in public.resorts, so it fell back to /resorts instead of linking to
-- /resorts/vasind. Mirrors 20260828120000 (resort row) and 20260828141000 (room types, units,
-- seasons, availability) but scoped only to this resort so it's safe to run after those.
-- ====================================================================================================

INSERT INTO public.resorts (slug, name, description, location, country, coordinates, amenities) VALUES
  ('vasind', 'Vasind Hillside Cottages',
   'Rustic cottages tucked against the Sahyadri hills, a quick escape from Mumbai and Thane.',
   'Vasind, Maharashtra', 'India',
   '{"lat": 19.3236, "lng": 73.3527}'::jsonb,
   '{"items": ["Hillside cottages", "Bonfire lawn", "Nature trails"]}'::jsonb)
ON CONFLICT (slug) DO NOTHING;

-- ============ ROOM TYPES: two, same as every other resort ============
INSERT INTO public.room_types
  (resort_id, code, name, description, max_adults, max_children, base_points_per_night, base_nightly_fee)
SELECT r.id, t.code, t.name, t.description, t.max_adults, t.max_children, t.points, t.fee
FROM public.resorts r
CROSS JOIN (VALUES
  ('STU', 'Studio Suite',     'Open-plan suite with a kitchenette and private balcony.', 2, 1, 250::numeric, 3500::numeric),
  ('1BR', 'One-Bedroom Villa','Separate bedroom, living room and a private sit-out.',    4, 2, 420::numeric, 6200::numeric)
) AS t(code, name, description, max_adults, max_children, points, fee)
WHERE r.slug = 'vasind'
ON CONFLICT (resort_id, code) DO NOTHING;

-- ============ UNITS: four per room type ============
INSERT INTO public.resort_units (resort_id, room_type_id, unit_number, floor, status)
SELECT rt.resort_id,
       rt.id,
       rt.code || '-' || LPAD(n::text, 3, '0'),
       ((n - 1) / 2) + 1,
       'active'
FROM public.room_types rt
JOIN public.resorts r ON r.id = rt.resort_id
CROSS JOIN generate_series(1, 4) AS n
WHERE r.slug = 'vasind'
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
WHERE r.slug = 'vasind'
  AND NOT EXISTS (
    SELECT 1 FROM public.seasons ex WHERE ex.resort_id = r.id AND ex.name = s.name
  );

-- ============ AVAILABILITY: one row per unit per night for the next 12 months ============
INSERT INTO public.availability (resort_unit_id, stay_date, status)
SELECT u.id, d::date, 'available'::public.inventory_status
FROM public.resort_units u
JOIN public.resorts r ON r.id = u.resort_id
CROSS JOIN generate_series(current_date, current_date + interval '12 months', interval '1 day') AS d
WHERE r.slug = 'vasind'
ON CONFLICT (resort_unit_id, stay_date) DO NOTHING;
