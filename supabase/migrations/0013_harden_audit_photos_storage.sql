-- 0013_harden_audit_photos_storage.sql
-- Applied to the live project 2026-10-14 as "harden_audit_photos_storage".
--
-- Audit photos are back-of-house kitchen images. The bucket had an anon SELECT
-- policy, and the anon key is public (it ships in the JS bundle) — so anyone
-- could list every object in the bucket and download or sign URLs for all of
-- them. Verified before the fix: POST /storage/v1/object/list/audit-photos with
-- the publishable key returned the full object listing.
--
-- The submit form never reads photos back (it previews from local blob URLs),
-- so anon needs INSERT only.
drop policy if exists "audit-photos anon read" on storage.objects;

-- The bucket had no size cap and no MIME restriction at all.
update storage.buckets
   set file_size_limit    = 10485760,  -- 10 MB; the client targets ~1.2 MB
       allowed_mime_types = array[
         'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'
       ]
 where id = 'audit-photos';

-- Accepting uploads from unauthenticated clients is inherent to a public photo
-- submission form, so constrain the shape rather than the capability: the path
-- must look like <submission-uuid>/<stream>/<file>.<image ext>, which is
-- exactly what web/src/lib/photos.ts writes.
drop policy if exists "audit-photos anon insert" on storage.objects;
drop policy if exists "audit-photos authenticated insert" on storage.objects;
drop policy if exists "audit-photos public insert" on storage.objects;
create policy "audit-photos public insert" on storage.objects
  for insert to anon, authenticated
  with check (
    bucket_id = 'audit-photos'
    and array_length(storage.foldername(name), 1) = 2
    and lower(storage.extension(name)) in ('jpg','jpeg','png','webp','heic','heif')
  );

-- Staff read ("audit-photos authenticated read") and admin delete are
-- unchanged from 0007.
--
-- Verified after applying: anon upload of a valid jpeg at the correct path
-- succeeds; upload at the bucket root or with a .html extension is rejected;
-- anon list, download, and sign all fail; an admin can still sign and view.
--
-- Orphans: photos are uploaded before the audit row exists, so an abandoned
-- form leaves files behind. Worth a scheduled cleanup of objects older than a
-- few days with no matching row in public.audit_photos.
