-- 0010_admin_semathew.sql
-- Grant admin access to semathew@andrew.cmu.edu.
--
-- Passwords are never stored in this repo. Create the Auth user first —
-- Supabase Dashboard → Authentication → Users → "Add user" (email +
-- password, "Auto Confirm User" on) — then apply this migration to attach
-- the admin profile row. Re-running is safe.
--
-- This grants admin to whoever holds that address in auth.users, so before
-- applying it confirm that (a) public sign-ups are disabled for this project
-- and (b) the row was created by an administrator rather than self-registered.
-- The email match is restricted to confirmed accounts for that reason. This is
-- a one-time, deliberate grant for the project owner's own account; any further
-- admins should go through /admin/users, which logs who created them.

do $$
declare
  target_email constant text := 'semathew@andrew.cmu.edu';
  uid uuid;
  clashing_id uuid;
begin
  select id into uid
    from auth.users
   where lower(email) = target_email
     and email_confirmed_at is not null
   limit 1;

  if uid is null then
    raise notice
      'No confirmed auth user for %. Create it in Supabase Auth (Add user, auto-confirm), then re-run this migration.',
      target_email;
    return;
  end if;

  -- public.users.email is unique; a stale row under a different auth id would
  -- otherwise fail the insert with a confusing constraint error.
  select id into clashing_id
    from public.users
   where lower(email) = target_email and id <> uid
   limit 1;
  if clashing_id is not null then
    raise notice 'public.users already has % under a different auth id (%). Resolve manually.', target_email, clashing_id;
    return;
  end if;

  insert into public.users (id, full_name, email, role, location_id, active)
  values (uid, 'Sam Mathew', target_email, 'admin', null, true)
  on conflict (id) do update
     set role     = 'admin',
         active   = true,
         email    = excluded.email,
         full_name = case
                       when coalesce(trim(public.users.full_name), '') = '' then excluded.full_name
                       else public.users.full_name
                     end;

  -- Optional convenience: allow signing in with the short username too,
  -- but never steal it from an existing account.
  update public.users
     set username = 'semathew'
   where id = uid
     and username is null
     and not exists (select 1 from public.users u2 where u2.username = 'semathew');

  raise notice 'Admin profile ensured for % (auth id %)', target_email, uid;
end $$;
