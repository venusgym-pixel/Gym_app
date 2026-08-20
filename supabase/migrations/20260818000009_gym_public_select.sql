-- ============================================================================
-- gym-public had no SELECT policy, so nothing could be managed in it.
--
-- 20260818000003 wrote insert and update policies for this bucket, and
-- 20260818000007 added delete. None of the three added select, and that is the
-- one everything else depends on: storage-api looks an object row up before
-- replacing or removing it, and a lookup that returns nothing is indistinguish-
-- able from a lookup that is forbidden. So delete answered "Access denied" and
-- upsert answered "new row violates row-level security policy" even for an
-- owner holding settings:edit.
--
-- Proven rather than reasoned about: listing gym-public as the owner returned
-- 0 objects while a public GET of those same files returned 200, and the
-- control bucket payment-proofs — which does have a select policy — listed its
-- contents normally.
--
-- The bucket being public is what hid this. Public applies to downloads by
-- URL, which bypass RLS entirely, so members always saw the QR and nobody
-- noticed the rows themselves were invisible to the API.
--
-- Scoped exactly like the other three: your own gym's folder, and settings
-- edit. Reading a QR needs no policy at all, so this grants nothing a member
-- did not already have by opening the public URL.
-- ============================================================================

do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then

    drop policy if exists gym_public_read on storage.objects;
    create policy gym_public_read on storage.objects for select to authenticated
      using (
        bucket_id = 'gym-public'
        and (storage.foldername(name))[1] = (select public.auth_gym_id())::text
        and (select public.has_permission('settings', 'edit'))
      );
  end if;
end;
$$;
