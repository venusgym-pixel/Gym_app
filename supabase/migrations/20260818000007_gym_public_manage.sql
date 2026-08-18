-- ============================================================================
-- The gym's UPI QR could be uploaded once and then never changed.
--
-- Proven against the live project, signed in as the owner: POST to a new path
-- returns 200, POST with x-upsert and PUT to the existing path both return
-- "new row violates row-level security policy", and DELETE returns "Access
-- denied". So the first save worked, and every attempt to replace the code
-- after that failed — from a screen whose only message was that it could not
-- upload.
--
-- 20260818000003 wrote an insert policy and an update policy for this bucket
-- but no delete policy, and something about the update path is refused all the
-- same. Rather than reason about which, this restates all three so the end
-- state is the same however the live database got where it is.
--
-- The app no longer depends on any of this: saveUpiDetails writes a fresh
-- object name each time, so uploading only needs INSERT. Update and delete are
-- here so a replaced code can actually be cleaned up instead of accumulating.
-- ============================================================================

do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then

    drop policy if exists gym_public_write on storage.objects;
    create policy gym_public_write on storage.objects for insert to authenticated
      with check (
        bucket_id = 'gym-public'
        and (storage.foldername(name))[1] = (select public.auth_gym_id())::text
        and (select public.has_permission('settings', 'edit'))
      );

    /* WITH CHECK spelled out rather than left to default to USING. Postgres
       does fall back to it, but an update policy that only says USING reads
       like the new row is unconstrained, and this bucket is public. */
    drop policy if exists gym_public_update on storage.objects;
    create policy gym_public_update on storage.objects for update to authenticated
      using (
        bucket_id = 'gym-public'
        and (storage.foldername(name))[1] = (select public.auth_gym_id())::text
        and (select public.has_permission('settings', 'edit'))
      )
      with check (
        bucket_id = 'gym-public'
        and (storage.foldername(name))[1] = (select public.auth_gym_id())::text
        and (select public.has_permission('settings', 'edit'))
      );

    -- Only within your own gym's folder, so this cannot become a way to wipe
    -- another tenant's assets.
    drop policy if exists gym_public_delete on storage.objects;
    create policy gym_public_delete on storage.objects for delete to authenticated
      using (
        bucket_id = 'gym-public'
        and (storage.foldername(name))[1] = (select public.auth_gym_id())::text
        and (select public.has_permission('settings', 'edit'))
      );
  end if;
end;
$$;
