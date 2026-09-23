-- Preserve historical reservations while removing the property from public discovery.
ALTER TABLE public.resorts
  ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;

UPDATE public.resorts
SET active = false
WHERE lower(name) = 'floora ecostay lonavala';