-- 0011_public_submit_grants.sql
-- Capture, as committed SQL, what the public (not-logged-in) submit form needs.
--
-- /submit is an anonymous page: there is no rep login any more. The grants it
-- depends on were applied directly to the hosted project and never recorded
-- here, which means a from-scratch rebuild produced a form that silently
-- failed — most visibly on photo upload, where `anon` had no INSERT policy on
-- storage.objects and every upload came back as an RLS violation.
--
-- Everything below is additive and idempotent. Reading photos is deliberately
-- NOT granted to anon: the submit form previews from local blob URLs, and only
-- staff should be able to pull images back out of the bucket.

-- 1. Location dropdown ----------------------------------------------------
-- Exposes only the names of active dining locations, which are already public
-- (they are printed on the doors).
drop policy if exists locations_public_read on public.locations;
create policy locations_public_read on public.locations
  for select to anon using (active = true);

-- 2. Photo upload from the public form ------------------------------------
-- Accepting uploads from unauthenticated clients is inherent to a public photo
-- submission form, so the limits are enforced rather than the capability:
--   * bucket-level size cap and MIME allow-list (applies to every caller)
--   * INSERT only — anon cannot read, overwrite, or delete objects
--   * path must match the shape the app writes: <submission-uuid>/<stream>/<file>
--   * image extensions only
update storage.buckets
   set file_size_limit   = 10485760,  -- 10 MB; the client targets ~1.2 MB
       allowed_mime_types = array[
         'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'
       ]
 where id = 'audit-photos';

drop policy if exists "audit-photos public insert" on storage.objects;
create policy "audit-photos public insert" on storage.objects
  for insert to anon, authenticated
  with check (
    bucket_id = 'audit-photos'
    and array_length(storage.foldername(name), 1) = 2
    and lower(storage.extension(name)) in ('jpg', 'jpeg', 'png', 'webp', 'heic', 'heif')
  );

-- Orphans: photos are uploaded before the audit row exists, so an abandoned
-- form leaves files behind. Worth a scheduled cleanup of objects older than a
-- few days with no matching row in public.audit_photos.

-- 3. recommended_audit_window ---------------------------------------------
-- Deliberately NOT granted to anon. It would let anyone probe per-location
-- audit timing, and the form already degrades silently without it: the
-- "suggested next window" hint simply does not render for logged-out users.

-- 4. submit_audit ---------------------------------------------------------
-- NOT changed here on purpose. The version in 0009 rejects anonymous callers
-- outright (`select * into caller from public.users where id = auth.uid()`
-- → null → 'not authorized'), and audits.submitted_by is NOT NULL, so the
-- function running in production must already differ from this repo. Dump the
-- live definition and commit it as its own migration rather than guessing:
--
--   select pg_get_functiondef('public.submit_audit(jsonb)'::regprocedure);
