-- Property photos are already resolved through signed URLs in the client.
alter policy property_photos_select_public on storage.objects to authenticated
using (bucket_id='property-photos' and (
 public.is_admin() or exists (select 1 from public.properties p where p.id::text=(storage.foldername(objects.name))[1] and p.owner_id=auth.uid())
 or exists (select 1 from public.missions m where m.property_id::text=(storage.foldername(objects.name))[1] and m.assigned_provider_id=auth.uid())
 or exists (select 1 from public.emergency_requests e where e.property_id::text=(storage.foldername(objects.name))[1] and e.accepted_provider_id=auth.uid())
));
alter policy "Public read access for mission proofs" on storage.objects to authenticated
using (bucket_id='mission_proofs' and (
 public.is_admin() or (storage.foldername(objects.name))[2]=auth.uid()::text
 or exists (select 1 from public.missions m where m.id::text=(storage.foldername(objects.name))[1] and (m.owner_id=auth.uid() or m.assigned_provider_id=auth.uid()))
));
update storage.buckets set public=false where id in ('property-photos','mission_proofs');
