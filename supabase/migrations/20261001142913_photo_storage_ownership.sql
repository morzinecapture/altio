-- Property upload paths are <property UUID>/<filename>.
alter policy property_photos_insert_authenticated on storage.objects
with check (bucket_id='property-photos' and exists (select 1 from public.properties p where p.id::text=(storage.foldername(name))[1] and p.owner_id=auth.uid()));
alter policy property_photos_update_authenticated on storage.objects
using (bucket_id='property-photos' and exists (select 1 from public.properties p where p.id::text=(storage.foldername(name))[1] and p.owner_id=auth.uid()))
with check (bucket_id='property-photos' and exists (select 1 from public.properties p where p.id::text=(storage.foldername(name))[1] and p.owner_id=auth.uid()));
alter policy property_photos_delete_authenticated on storage.objects
using (bucket_id='property-photos' and exists (select 1 from public.properties p where p.id::text=(storage.foldername(name))[1] and p.owner_id=auth.uid()));
-- Mission proof paths are <mission UUID>/<uploader UUID>/<filename>.
alter policy "Authenticated users can upload mission proofs" on storage.objects
with check (bucket_id='mission_proofs' and (storage.foldername(name))[2]=auth.uid()::text and exists (
 select 1 from public.missions m where m.id::text=(storage.foldername(name))[1] and (m.owner_id=auth.uid() or m.assigned_provider_id=auth.uid())
));
alter policy "Users can update own mission proofs" on storage.objects
with check (bucket_id='mission_proofs' and (storage.foldername(name))[2]=auth.uid()::text and exists (
 select 1 from public.missions m where m.id::text=(storage.foldername(name))[1] and (m.owner_id=auth.uid() or m.assigned_provider_id=auth.uid())
));
