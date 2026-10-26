-- Photos move out of the database and into Storage.
--
-- Every photo and avatar was being kept as a base64 data URL in a text column:
-- `compressImage` handed back a `data:image/jpeg;base64,...` string and that
-- string went straight into web_photos.data_url. It works, and it is why photos
-- needed no bucket, no policies and no signing -- but it bills the worst way
-- round. Base64 is a third larger than the JPEG it encodes, those rows sit in
-- the 500 MB Postgres allowance rather than the 1 GB Storage allowance, and
-- every read drags the whole image back through PostgREST instead of a CDN. One
-- photo measured 632 kB of table; a thousand of them would be the entire free
-- database.
--
-- So: new photos go to a bucket and the row keeps only a path. Old rows keep
-- their data_url and still render -- there are single digits of them, and a
-- fallback in the read path costs less than a migration that rewrites image
-- bytes through SQL.
--
-- The photos bucket is PRIVATE. web_photos_select already enforces a real
-- privacy rule (yours, or a friend's where the entry is not marked private) and
-- a public bucket would quietly replace that rule with "anyone holding the URL",
-- which is not what someone ticking "private" is asking for. Reads therefore go
-- through short-lived signed URLs, and the policies below decide who may sign.
-- Avatars are the opposite case -- discover_users and search_users hand every
-- signed-in user your avatar by design -- so that bucket is public and is read
-- straight from the CDN.

-- Paths are built by us ({user_id}/{entry_id}/{uuid}.jpg), but a policy that
-- casts a path segment to uuid would throw on anything malformed rather than
-- simply not matching. Fail closed to NULL instead.
create or replace function public.safe_uuid(t text)
returns uuid
language sql
immutable
set search_path to ''
as $function$
  select case
    when t ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then t::uuid
  end;
$function$;

revoke all on function public.safe_uuid(text) from public, anon;
grant execute on function public.safe_uuid(text) to authenticated;

-- ── web_photos: a path instead of the bytes ─────────────────────────────────
alter table public.web_photos add column if not exists storage_path text;
alter table public.web_photos alter column data_url drop not null;

-- A photo is one or the other, never neither: a row with no image is a broken
-- grid tile, and the read path has nothing to fall back to.
alter table public.web_photos drop constraint if exists web_photos_has_image;
alter table public.web_photos add constraint web_photos_has_image
  check (data_url is not null or storage_path is not null);

-- ── Buckets ─────────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 1048576, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = true,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ── photos bucket policies ──────────────────────────────────────────────────
-- Deliberately the same rule as web_photos_select, one layer down: the row and
-- the object it points at must not be able to disagree about who may see it.
drop policy if exists "photos read own or friends" on storage.objects;
create policy "photos read own or friends"
on storage.objects for select to authenticated
using (
  bucket_id = 'photos'
  and (
    public.safe_uuid((storage.foldername(name))[1]) = (select auth.uid())
    or (
      public.are_friends((select auth.uid()), public.safe_uuid((storage.foldername(name))[1]))
      and not coalesce(public.is_entry_private(public.safe_uuid((storage.foldername(name))[2])), false)
    )
  )
);

-- The first path segment being your own id is what makes the read policy above
-- meaningful -- without it anyone could write into anyone's folder.
drop policy if exists "photos write own folder" on storage.objects;
create policy "photos write own folder"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'photos'
  and public.safe_uuid((storage.foldername(name))[1]) = (select auth.uid())
);

drop policy if exists "photos update own" on storage.objects;
create policy "photos update own"
on storage.objects for update to authenticated
using (
  bucket_id = 'photos'
  and public.safe_uuid((storage.foldername(name))[1]) = (select auth.uid())
);

drop policy if exists "photos delete own" on storage.objects;
create policy "photos delete own"
on storage.objects for delete to authenticated
using (
  bucket_id = 'photos'
  and public.safe_uuid((storage.foldername(name))[1]) = (select auth.uid())
);

-- ── avatars bucket policies ─────────────────────────────────────────────────
-- Reads need no policy: a public bucket is served from the CDN without one.
drop policy if exists "avatars write own folder" on storage.objects;
create policy "avatars write own folder"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'avatars'
  and public.safe_uuid((storage.foldername(name))[1]) = (select auth.uid())
);

drop policy if exists "avatars update own" on storage.objects;
create policy "avatars update own"
on storage.objects for update to authenticated
using (
  bucket_id = 'avatars'
  and public.safe_uuid((storage.foldername(name))[1]) = (select auth.uid())
);

drop policy if exists "avatars delete own" on storage.objects;
create policy "avatars delete own"
on storage.objects for delete to authenticated
using (
  bucket_id = 'avatars'
  and public.safe_uuid((storage.foldername(name))[1]) = (select auth.uid())
);

-- Deleting the account has to take the images with it, or the bucket keeps
-- paying for people who left. storage.objects is not in the delete_my_account
-- list below by accident -- it could not be, before there was a bucket.
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not authenticated'; end if;
  delete from storage.objects
    where bucket_id in ('photos', 'avatars')
      and public.safe_uuid((storage.foldername(name))[1]) = uid;
  delete from web_entries  where user_id = uid;
  delete from web_sessions where user_id = uid;
  delete from web_photos   where user_id = uid;
  delete from web_notes    where user_id = uid;
  delete from feedback     where user_id = uid;
  delete from friendships  where requester = uid or addressee = uid;
  delete from web_profile  where user_id = uid;
  delete from auth.users   where id = uid;
end;
$function$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
