-- ============================================================================
-- 0023 · Payment proofs leaked across members. Close it.
--
-- The read policy checked has_permission('payments','view'), and that
-- function is deliberately scope-blind — it answers "may this ROLE view
-- payments at all", not "which ones". Members hold payments: view with scope
-- 'own', so it returned true for them and every member could read every
-- payment screenshot in their gym: other people's names, amounts and usually
-- their bank or UPI handle.
--
-- This is exactly why every generated table policy in 0001 also requires
-- scope = 'all'. The storage policies were written by hand and did not.
--
-- The write policy had the smaller version of the same hole: it checked only
-- that the first path segment was the caller's gym, so a member could place
-- files inside another member's folder.
-- ============================================================================

do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then

    /* Staff with gym-wide scope see everything; a member sees only the folder
       named after their own member id, which is the second path segment. */
    drop policy if exists payment_proofs_read on storage.objects;
    create policy payment_proofs_read on storage.objects for select to authenticated
      using (
        bucket_id = 'payment-proofs'
        and (storage.foldername(name))[1] = (select public.auth_gym_id())::text
        and (
          (
            (select public.has_permission('payments', 'view'))
            and (select public.permission_scope('payments')) = 'all'
          )
          or exists (
            select 1 from public.members m
             where m.user_id = (select auth.uid())
               and m.id::text = (storage.foldername(name))[2]
          )
        )
      );

    -- Same shape for writes: staff anywhere in their gym, members only into
    -- their own folder.
    drop policy if exists payment_proofs_write on storage.objects;
    create policy payment_proofs_write on storage.objects for insert to authenticated
      with check (
        bucket_id = 'payment-proofs'
        and (storage.foldername(name))[1] = (select public.auth_gym_id())::text
        and (
          (
            (select public.has_permission('payments', 'create'))
            and (select public.permission_scope('payments')) = 'all'
          )
          or exists (
            select 1 from public.members m
             where m.user_id = (select auth.uid())
               and m.id::text = (storage.foldername(name))[2]
          )
        )
      );
  end if;
end;
$$;
