-- ====================================================================================================
-- Adds a gallery of extra photos per resort, alongside the existing single `image_url` cover photo.
-- ====================================================================================================

ALTER TABLE public.resorts
  ADD COLUMN IF NOT EXISTS gallery jsonb NOT NULL DEFAULT '[]'::jsonb;
