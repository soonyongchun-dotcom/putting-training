-- 07_storage_attachments_bucket_hotfix.sql
-- Hotfix: create/repair public Storage bucket used by client uploads.

begin;

-- 1) Ensure bucket exists and is public
insert into storage.buckets (id, name, public)
values ('attachments', 'attachments', true)
on conflict (id)
do update set
  name = excluded.name,
  public = true;

-- 2) Recreate storage policies idempotently
-- Read: public URL access
 drop policy if exists attachments_public_read on storage.objects;
create policy attachments_public_read
on storage.objects
for select
to public
using (bucket_id = 'attachments');

-- Write: this app uses the anonymous client, so allow uploads into attachments.
 drop policy if exists attachments_authenticated_insert on storage.objects;
create policy attachments_authenticated_insert
on storage.objects
for insert
to anon, authenticated
with check (bucket_id = 'attachments');

-- Optional maintenance permissions for authenticated users
 drop policy if exists attachments_authenticated_update on storage.objects;
create policy attachments_authenticated_update
on storage.objects
for update
to authenticated
using (bucket_id = 'attachments')
with check (bucket_id = 'attachments');

 drop policy if exists attachments_authenticated_delete on storage.objects;
create policy attachments_authenticated_delete
on storage.objects
for delete
to authenticated
using (bucket_id = 'attachments');

commit;
