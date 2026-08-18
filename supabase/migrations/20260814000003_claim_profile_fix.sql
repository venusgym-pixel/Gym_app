-- ============================================================================
-- 0020 · claim_code_complete must create the profile row itself.
--
-- members.user_id references profiles(id), not auth.users(id). Creating the
-- auth user is therefore not enough: without a matching profile the link
-- fails on members_user_id_fkey, the code is never burned, and the member is
-- left with an auth account that points at nothing.
--
-- The caller did insert a profile — but only on the path that creates a NEW
-- auth user. Re-claiming an existing account, or adopting an auth user left
-- behind by a deleted member, both skipped it. Doing it here means every
-- path is covered and the ordering cannot be got wrong again.
-- ============================================================================

create or replace function claim_code_complete(
  p_hash          text,
  p_member_id     uuid,
  p_user_id       uuid,
  p_recovery_hash text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_gym uuid;
  v_member public.members%rowtype;
begin
  select gym_id into v_gym
    from public.member_claim_codes
   where code_hash = p_hash and used_at is null and expires_at > now();

  if v_gym is null then raise exception 'claim code is no longer valid'; end if;

  select * into v_member from public.members where id = p_member_id and gym_id = v_gym;
  if not found then raise exception 'member not found for this code'; end if;

  -- The profile the foreign key needs. Named from the member record, which is
  -- the only place their real name lives at this point.
  insert into public.profiles (id, full_name, phone)
  values (p_user_id, v_member.full_name, v_member.phone)
  on conflict (id) do update
    set full_name = coalesce(public.profiles.full_name, excluded.full_name),
        phone     = coalesce(public.profiles.phone, excluded.phone);

  update public.members
     set user_id = p_user_id,
         claimed_at = now(),
         recovery_code_hash = p_recovery_hash
   where id = p_member_id and gym_id = v_gym;

  -- Without this, auth_gym_id() returns null and every policy denies the
  -- member their own data: the app loads and shows them nothing.
  insert into public.gym_users (gym_id, user_id, role, is_active)
  values (v_gym, p_user_id, 'member', true)
  on conflict (gym_id, user_id)
    do update set is_active = true, revoked_at = null;

  update public.member_claim_codes set used_at = now() where code_hash = p_hash;
end;
$$;

grant execute on function claim_code_complete(text, uuid, uuid, text) to anon, authenticated;
