-- Baseline seed data granted the MEMBER role 'bookings.read', but every reservations-
-- adjacent RLS policy (reservations, reservation_items, reservation_guests, ledgers)
-- treats that permission as staff-level "can see every row", not "can see my own".
-- Result: every member could see every other member's bookings. Members are meant to
-- rely on booked_by/member_id ownership checks only, never this permission.
DELETE FROM public.role_permissions
WHERE role_key = 'MEMBER' AND permission_key = 'bookings.read';
