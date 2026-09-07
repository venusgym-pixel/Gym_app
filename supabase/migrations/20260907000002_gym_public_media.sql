-- Let the people who own the content upload its pictures.
--
-- gym-public's write policies asked for settings:edit, which was right when
-- the only thing in the bucket was the gym's UPI code. It now also has to hold
-- exercise clips and equipment photos, and the people who maintain those do
-- not have settings:edit — a trainer owns the exercise library and an owner
-- had to be fetched to attach a demonstration video to it.
--
-- So the question becomes "may you edit the thing this picture belongs to"
-- rather than "are you an owner". The tenant boundary is untouched: the first
-- path segment is still the gym id, and it is still the only folder anyone can
-- write to.
--
-- Read stays broader than write, deliberately. The bucket is public — the
-- files are served by URL to anyone who has one — so a stricter select policy
-- would only stop staff managing files they can already open.

do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then

    /* One predicate, three verbs. Written once here rather than repeated so
       the read, write and delete rules cannot drift apart later. */

    drop policy if exists gym_public_read on storage.objects;
    create policy gym_public_read on storage.objects for select to authenticated
      using (
        bucket_id = 'gym-public'
        and (storage.foldername(name))[1] = (select public.auth_gym_id())::text
      );

    drop policy if exists gym_public_write on storage.objects;
    create policy gym_public_write on storage.objects for insert to authenticated
      with check (
        bucket_id = 'gym-public'
        and (storage.foldername(name))[1] = (select public.auth_gym_id())::text
        and (
          (select public.has_permission('settings', 'edit'))
          or (select public.has_permission('exercises', 'edit'))
          or (select public.has_permission('equipment', 'edit'))
        )
      );

    drop policy if exists gym_public_update on storage.objects;
    create policy gym_public_update on storage.objects for update to authenticated
      using (
        bucket_id = 'gym-public'
        and (storage.foldername(name))[1] = (select public.auth_gym_id())::text
        and (
          (select public.has_permission('settings', 'edit'))
          or (select public.has_permission('exercises', 'edit'))
          or (select public.has_permission('equipment', 'edit'))
        )
      )
      with check (
        bucket_id = 'gym-public'
        and (storage.foldername(name))[1] = (select public.auth_gym_id())::text
      );

    /* Delete stays with settings:edit. Removing a file is how a picture
       disappears from every row that ever referenced it, and that is an
       owner's call rather than a side effect of editing one exercise. */
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
