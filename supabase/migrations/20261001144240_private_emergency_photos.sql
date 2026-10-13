-- Photos are uploaded under the owner's UUID before the request is created.
alter policy "Owners can upload emergency photos" on storage.objects to authenticated
with check (bucket_id='emergency-photos' and (storage.foldername(objects.name))[1]=auth.uid()::text);
alter policy "Authenticated users can view emergency photos" on storage.objects to authenticated
using (bucket_id='emergency-photos' and (
 public.is_admin() or (storage.foldername(objects.name))[1]=auth.uid()::text
 or exists (select 1 from public.emergency_requests e
   where exists (select 1 from unnest(e.photos) as photo(url)
      where split_part(photo.url,'/emergency-photos/',2)=objects.name)
   and (e.owner_id=auth.uid() or e.accepted_provider_id=auth.uid()
     or (e.status in ('open','bids_open','pending')
       and (e.target_provider_id is null or e.target_provider_id=auth.uid())
       and exists (select 1 from public.users u where u.id=auth.uid() and u.role='provider'))))
));
create policy "Owners can delete emergency photos" on storage.objects for delete to authenticated
using (bucket_id='emergency-photos' and (storage.foldername(objects.name))[1]=auth.uid()::text);
-- Old clients must update rather than continue leaking emergency photos into avatars.
create policy "Emergency photos cannot use public avatars" on storage.objects as restrictive for insert to authenticated
with check (bucket_id <> 'avatars' or storage.filename(objects.name) not like 'emergency\_%' escape '\');
update storage.buckets set public=false where id='emergency-photos';
