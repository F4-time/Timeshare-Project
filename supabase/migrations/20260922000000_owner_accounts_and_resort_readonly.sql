-- Link an owner login to the resort whose inventory they may view.
ALTER TABLE public.owners
  ADD COLUMN IF NOT EXISTS resort_id uuid REFERENCES public.resorts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS owners_resort_idx ON public.owners (resort_id);