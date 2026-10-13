alter policy property_photos_insert_authenticated on storage.objects
with check (bucket_id='property-photos' and exists (select 1 from public.properties p where p.id::text=(storage.foldername(objects.name))[1] and p.owner_id=auth.uid()));
alter policy property_photos_update_authenticated on storage.objects
using (bucket_id='property-photos' and exists (select 1 from public.properties p where p.id::text=(storage.foldername(objects.name))[1] and p.owner_id=auth.uid()))
with check (bucket_id='property-photos' and exists (select 1 from public.properties p where p.id::text=(storage.foldername(objects.name))[1] and p.owner_id=auth.uid()));
alter policy property_photos_delete_authenticated on storage.objects
using (bucket_id='property-photos' and exists (select 1 from public.properties p where p.id::text=(storage.foldername(objects.name))[1] and p.owner_id=auth.uid()));
