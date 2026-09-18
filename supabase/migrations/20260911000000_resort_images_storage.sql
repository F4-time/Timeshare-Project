-- ====================================================================================================
-- Storage bucket for resort images uploaded from the admin "Add resort" form.
-- Public bucket so member-facing pages can render images without a signed URL.
-- ====================================================================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('resort-images', 'resort-images', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS "resort_images_read_all" ON storage.objects;
CREATE POLICY "resort_images_read_all" ON storage.objects FOR SELECT
  TO anon, authenticated USING (bucket_id = 'resort-images');

DROP POLICY IF EXISTS "resort_images_write_admin" ON storage.objects;
CREATE POLICY "resort_images_write_admin" ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'resort-images' AND public.has_permission(auth.uid(), 'inventory.write'));

DROP POLICY IF EXISTS "resort_images_update_admin" ON storage.objects;
CREATE POLICY "resort_images_update_admin" ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'resort-images' AND public.has_permission(auth.uid(), 'inventory.write'))
  WITH CHECK (bucket_id = 'resort-images' AND public.has_permission(auth.uid(), 'inventory.write'));

DROP POLICY IF EXISTS "resort_images_delete_admin" ON storage.objects;
CREATE POLICY "resort_images_delete_admin" ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'resort-images' AND public.has_permission(auth.uid(), 'inventory.write'));
