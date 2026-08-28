-- ============ Stage 07: inventory engine functions ============

CREATE OR REPLACE FUNCTION public.admin_publish_availability(
  _resort_id uuid,
  _from date,
  _to date,
  _room_type_id uuid DEFAULT NULL
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _count integer := 0;
BEGIN
  IF NOT public.has_permission(auth.uid(), 'inventory.write') THEN
    RAISE EXCEPTION 'Not authorised to manage inventory';
  END IF;
  IF _to < _from THEN
    RAISE EXCEPTION 'End date must be on or after start date';
  END IF;

  INSERT INTO public.availability (resort_unit_id, stay_date, status)
  SELECT u.id, d::date, 'available'::inventory_status
  FROM public.resort_units u
  CROSS JOIN generate_series(_from, _to, interval '1 day') AS d
  WHERE u.resort_id = _resort_id
    AND u.status = 'active'
    AND (_room_type_id IS NULL OR u.room_type_id = _room_type_id)
  ON CONFLICT (resort_unit_id, stay_date) DO UPDATE
    SET status = 'available', updated_at = now()
    WHERE public.availability.status IN ('blocked', 'maintenance');

  GET DIAGNOSTICS _count = ROW_COUNT;
  RETURN _count;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_availability(
  _resort_unit_id uuid,
  _from date,
  _to date,
  _status inventory_status,
  _note text DEFAULT NULL
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _count integer := 0;
BEGIN
  IF NOT public.has_permission(auth.uid(), 'inventory.write') THEN
    RAISE EXCEPTION 'Not authorised to manage inventory';
  END IF;
  IF _to < _from THEN
    RAISE EXCEPTION 'End date must be on or after start date';
  END IF;
  IF _status = 'booked' THEN
    RAISE EXCEPTION 'Bookings are created by the booking engine, not manually';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.availability a
    WHERE a.resort_unit_id = _resort_unit_id
      AND a.stay_date BETWEEN _from AND _to
      AND a.status = 'booked'
  ) THEN
    RAISE EXCEPTION 'That range contains booked nights';
  END IF;

  INSERT INTO public.availability (resort_unit_id, stay_date, status, note)
  SELECT _resort_unit_id, d::date, _status, _note
  FROM generate_series(_from, _to, interval '1 day') AS d
  ON CONFLICT (resort_unit_id, stay_date) DO UPDATE
    SET status = EXCLUDED.status, note = EXCLUDED.note, updated_at = now();

  GET DIAGNOSTICS _count = ROW_COUNT;
  RETURN _count;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_apply_blackout(
  _resort_id uuid,
  _room_type_id uuid,
  _start_date date,
  _end_date date,
  _reason text,
  _applies_to text DEFAULT 'all'
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _id uuid;
BEGIN
  IF NOT public.has_permission(auth.uid(), 'inventory.write') THEN
    RAISE EXCEPTION 'Not authorised to manage inventory';
  END IF;
  IF _end_date < _start_date THEN
    RAISE EXCEPTION 'End date must be on or after start date';
  END IF;

  INSERT INTO public.blackouts (resort_id, room_type_id, start_date, end_date, reason, applies_to)
  VALUES (_resort_id, _room_type_id, _start_date, _end_date, _reason, coalesce(_applies_to, 'all'))
  RETURNING id INTO _id;

  INSERT INTO public.availability (resort_unit_id, stay_date, status, note)
  SELECT u.id, d::date, 'blocked'::inventory_status, _reason
  FROM public.resort_units u
  CROSS JOIN generate_series(_start_date, _end_date, interval '1 day') AS d
  WHERE (_resort_id IS NULL OR u.resort_id = _resort_id)
    AND (_room_type_id IS NULL OR u.room_type_id = _room_type_id)
    AND u.status = 'active'
  ON CONFLICT (resort_unit_id, stay_date) DO UPDATE
    SET status = 'blocked', note = _reason, updated_at = now()
    WHERE public.availability.status <> 'booked';

  RETURN _id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_publish_availability(uuid, date, date, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_set_availability(uuid, date, date, inventory_status, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_apply_blackout(uuid, uuid, date, date, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_publish_availability(uuid, date, date, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_set_availability(uuid, date, date, inventory_status, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_apply_blackout(uuid, uuid, date, date, text, text) TO authenticated, service_role;

-- ============ Seed: three published resorts ============

INSERT INTO public.resorts (slug, name, city, state, country, description, status)
VALUES
  ('tuscan-heritage-villas', 'Tuscan Heritage Villas', 'Val d''Orcia', 'Tuscany', 'Italy',
   'Restored stone estates above the Val d''Orcia, with private infinity terraces, olive groves and a cellar kitchen.', 'published'),
  ('cycladic-white-cliffs', 'Cycladic White Cliffs', 'Oia', 'Santorini', 'Greece',
   'Whitewashed cliffside residences suspended over the Aegean, each with a caldera-facing plunge pool.', 'published'),
  ('maldivian-private-atolls', 'Maldivian Private Atolls', 'Baa Atoll', NULL, 'Maldives',
   'Overwater bungalows with glass floors and direct lagoon access on a private reef-fringed atoll.', 'published')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.resort_amenities (resort_id, label, icon)
SELECT r.id, a.label, a.icon
FROM public.resorts r
JOIN (VALUES
  ('tuscan-heritage-villas', 'Private infinity pool', 'waves'),
  ('tuscan-heritage-villas', 'Estate cellar dining', 'utensils'),
  ('tuscan-heritage-villas', 'Vineyard tours', 'grape'),
  ('cycladic-white-cliffs', 'Caldera plunge pool', 'waves'),
  ('cycladic-white-cliffs', 'Sunset terrace', 'sun'),
  ('cycladic-white-cliffs', 'Private chef service', 'utensils'),
  ('maldivian-private-atolls', 'Overwater villas', 'anchor'),
  ('maldivian-private-atolls', 'House reef diving', 'fish'),
  ('maldivian-private-atolls', 'Spa pavilion', 'flower')
) AS a(slug, label, icon) ON a.slug = r.slug
WHERE NOT EXISTS (SELECT 1 FROM public.resort_amenities x WHERE x.resort_id = r.id AND x.label = a.label);

INSERT INTO public.buildings (resort_id, name, floors)
SELECT r.id, b.name, b.floors
FROM public.resorts r
JOIN (VALUES
  ('tuscan-heritage-villas', 'Villa Podere', 2),
  ('cycladic-white-cliffs', 'Cliff Wing', 3),
  ('maldivian-private-atolls', 'Lagoon Jetty', 1)
) AS b(slug, name, floors) ON b.slug = r.slug
WHERE NOT EXISTS (SELECT 1 FROM public.buildings x WHERE x.resort_id = r.id AND x.name = b.name);

INSERT INTO public.room_types (resort_id, code, name, description, max_adults, max_children, base_points_per_night, base_nightly_fee)
SELECT r.id, t.code, t.name, t.description, t.max_adults, t.max_children, t.pts, t.fee
FROM public.resorts r
JOIN (VALUES
  ('tuscan-heritage-villas', 'TUS-2BR', 'Two-Bedroom Estate Villa', 'Two bedrooms, cellar kitchen and a private terrace over the valley.', 4, 2, 400::numeric, 120::numeric),
  ('tuscan-heritage-villas', 'TUS-3BR', 'Three-Bedroom Podere', 'Three bedrooms with an olive-grove garden and infinity pool.', 6, 3, 600::numeric, 180::numeric),
  ('cycladic-white-cliffs', 'CYC-1BR', 'Caldera Suite', 'One-bedroom suite carved into the cliff with a plunge pool.', 2, 1, 350::numeric, 110::numeric),
  ('cycladic-white-cliffs', 'CYC-2BR', 'Cliffside Residence', 'Two-bedroom residence with a sunset terrace.', 4, 2, 520::numeric, 160::numeric),
  ('maldivian-private-atolls', 'MLD-OWB', 'Overwater Bungalow', 'Bungalow on stilts with glass floor and lagoon steps.', 2, 2, 500::numeric, 200::numeric),
  ('maldivian-private-atolls', 'MLD-BFV', 'Beachfront Villa', 'Two-bedroom villa on the sand with a private pool.', 4, 2, 700::numeric, 260::numeric)
) AS t(slug, code, name, description, max_adults, max_children, pts, fee) ON t.slug = r.slug
WHERE NOT EXISTS (SELECT 1 FROM public.room_types x WHERE x.resort_id = r.id AND x.code = t.code);

INSERT INTO public.resort_units (resort_id, building_id, room_type_id, unit_number, floor, status)
SELECT rt.resort_id,
       (SELECT b.id FROM public.buildings b WHERE b.resort_id = rt.resort_id LIMIT 1),
       rt.id,
       rt.code || '-' || lpad(n::text, 2, '0'),
       ((n - 1) % 2) + 1,
       'active'
FROM public.room_types rt
CROSS JOIN generate_series(1, 4) AS n
WHERE NOT EXISTS (
  SELECT 1 FROM public.resort_units u
  WHERE u.room_type_id = rt.id AND u.unit_number = rt.code || '-' || lpad(n::text, 2, '0')
);

INSERT INTO public.seasons (resort_id, name, start_date, end_date, points_multiplier)
SELECT r.id, s.name, s.start_date::date, s.end_date::date, s.mult
FROM public.resorts r
JOIN (VALUES
  ('tuscan-heritage-villas', 'Peak Summer', '2026-06-01', '2026-09-15', 1.4::numeric),
  ('tuscan-heritage-villas', 'Shoulder', '2026-03-01', '2026-05-31', 1.0::numeric),
  ('cycladic-white-cliffs', 'Peak Summer', '2026-06-15', '2026-09-30', 1.5::numeric),
  ('cycladic-white-cliffs', 'Shoulder', '2026-04-01', '2026-06-14', 1.0::numeric),
  ('maldivian-private-atolls', 'Dry Season', '2026-11-01', '2027-04-30', 1.6::numeric),
  ('maldivian-private-atolls', 'Green Season', '2026-05-01', '2026-10-31', 0.9::numeric)
) AS s(slug, name, start_date, end_date, mult) ON s.slug = r.slug
WHERE NOT EXISTS (SELECT 1 FROM public.seasons x WHERE x.resort_id = r.id AND x.name = s.name);