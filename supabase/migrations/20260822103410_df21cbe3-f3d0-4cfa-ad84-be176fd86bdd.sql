DROP POLICY IF EXISTS "own documents readable" ON storage.objects;
CREATE POLICY "own documents readable" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'member-documents'
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR public.has_permission(auth.uid(), 'documents.read')
    OR public.has_role(auth.uid(), 'SUPER_ADMIN')
  )
);

DROP POLICY IF EXISTS "staff can upload documents" ON storage.objects;
CREATE POLICY "staff can upload documents" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'member-documents'
  AND (
    public.has_permission(auth.uid(), 'documents.read')
    OR public.has_role(auth.uid(), 'SUPER_ADMIN')
  )
);

DROP POLICY IF EXISTS "staff can remove documents" ON storage.objects;
CREATE POLICY "staff can remove documents" ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'member-documents'
  AND (
    public.has_permission(auth.uid(), 'documents.read')
    OR public.has_role(auth.uid(), 'SUPER_ADMIN')
  )
);