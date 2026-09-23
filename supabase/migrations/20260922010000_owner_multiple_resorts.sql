-- An owner account may be responsible for more than one resort.
CREATE TABLE IF NOT EXISTS public.owner_resorts (
  owner_id uuid NOT NULL REFERENCES public.owners(id) ON DELETE CASCADE,
  resort_id uuid NOT NULL REFERENCES public.resorts(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_id, resort_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.owner_resorts TO authenticated;
GRANT ALL ON public.owner_resorts TO service_role;
ALTER TABLE public.owner_resorts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner_resorts_select_own_or_admin" ON public.owner_resorts
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.owners o WHERE o.id = owner_id AND o.user_id = auth.uid())
    OR public.has_permission(auth.uid(), 'owners.read')
  );

CREATE POLICY "owner_resorts_write_admin" ON public.owner_resorts
  FOR ALL TO authenticated
  USING (public.has_permission(auth.uid(), 'owners.write'))
  WITH CHECK (public.has_permission(auth.uid(), 'owners.write'));

-- Preserve any accounts created with the earlier single-resort column.
INSERT INTO public.owner_resorts (owner_id, resort_id)
SELECT id, resort_id FROM public.owners WHERE resort_id IS NOT NULL
ON CONFLICT DO NOTHING;