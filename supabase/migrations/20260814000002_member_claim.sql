-- ============================================================================
-- 0019 · Member app access, handed over at the desk.
--
-- Reception creates members; until now nothing turned one into a login. The
-- usual answer is to email or SMS a link, and this gym has neither channel,
-- so the handover is physical: a short code shown on the counter screen and
-- scanned by the member standing in front of it.
--
-- After that the member is self-sufficient. They sign in with their phone and
-- a password they choose, and a one-time recovery code gets them back in
-- without returning to the desk. Reception is involved exactly once.
-- ============================================================================

create table member_claim_codes (
  id          uuid primary key default gen_random_uuid(),
  gym_id      uuid not null references gyms(id) on delete cascade,
  member_id   uuid not null references members(id) on delete cascade,

  -- The digest, never the code. A claim code is a bearer credential for its
  -- lifetime: anyone reading this table should not be able to use one.
  code_hash   text not null,

  expires_at  timestamptz not null,
  used_at     timestamptz,
  created_by  uuid references profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);

-- gym_id leads, per the isolation suite. The digest lookup is the hot path
-- for /join and has its own index.
create index member_claim_codes_gym_idx on member_claim_codes (gym_id, member_id);
create unique index member_claim_codes_hash_idx on member_claim_codes (code_hash);

select private.apply_tenant_rls('member_claim_codes', 'members');

-- The recovery code lives on the member: one live code at a time, replaced
-- whenever it is used. Hashed for the same reason as above.
alter table members
  add column recovery_code_hash text,
  add column claimed_at timestamptz;

comment on column members.recovery_code_hash is
  'Digest of the one-time recovery code shown at claim. Lets a member reset '
  'their own password with no email, SMS or trip to the front desk.';


-- ── claim, without a session ────────────────────────────────────────────────
--
-- The member has no account yet, so none of this can run under RLS as them.
-- It could run as the service role in application code, but a claim code is
-- looked up across every gym — the code is all we have, the tenant is what we
-- are trying to discover — and withGymScope() exists precisely to stop that
-- being done casually. So the cross-tenant part lives here, as definer
-- functions with a deliberately narrow return, rather than as a service-role
-- query with a fabricated gym id.

/** What the /join screen shows before anyone has proved anything. */
create or replace function claim_code_peek(p_hash text)
returns table (member_id uuid, gym_id uuid, full_name text, gym_name text, masked_phone text)
language sql
stable
security definer
set search_path = ''
as $$
  select c.member_id, c.gym_id, m.full_name, g.name,
         -- Never the whole number: a code found on the floor should not hand
         -- over someone's phone number.
         '+91 ' || substr(regexp_replace(m.phone, '\D', '', 'g'), 3, 5) || ' •• ••'
    from public.member_claim_codes c
    join public.members m on m.id = c.member_id
    join public.gyms g    on g.id = c.gym_id
   where c.code_hash = p_hash
     and c.used_at is null
     and c.expires_at > now();
$$;

/** The second factor. Returns nothing unless the last four digits match. */
create or replace function claim_code_verify(p_hash text, p_last4 text)
returns table (member_id uuid, gym_id uuid, user_id uuid, phone text, full_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select c.member_id, c.gym_id, m.user_id, m.phone, m.full_name
    from public.member_claim_codes c
    join public.members m on m.id = c.member_id
   where c.code_hash = p_hash
     and c.used_at is null
     and c.expires_at > now()
     and length(p_last4) = 4
     and right(m.phone, 4) = p_last4;
$$;

/**
 * Attach the login and burn the code, in one transaction.
 *
 * The gym_users row is the part that is easy to forget and impossible to
 * diagnose: without it auth_gym_id() returns null and every policy denies the
 * member their own data, so the app loads and shows them nothing.
 */
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
begin
  select gym_id into v_gym
    from public.member_claim_codes
   where code_hash = p_hash and used_at is null and expires_at > now();

  if v_gym is null then raise exception 'claim code is no longer valid'; end if;

  update public.members
     set user_id = p_user_id,
         claimed_at = now(),
         recovery_code_hash = p_recovery_hash
   where id = p_member_id and gym_id = v_gym;

  insert into public.gym_users (gym_id, user_id, role, is_active)
  values (v_gym, p_user_id, 'member', true)
  on conflict (gym_id, user_id)
    do update set is_active = true, revoked_at = null;

  update public.member_claim_codes set used_at = now() where code_hash = p_hash;
end;
$$;

/** Recovery: phone plus the one-time code, matched together or not at all. */
create or replace function recovery_lookup(p_phone text, p_hash text)
returns table (member_id uuid, gym_id uuid, user_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select m.id, m.gym_id, m.user_id
    from public.members m
   where m.phone = p_phone
     and m.recovery_code_hash = p_hash
     and m.user_id is not null;
$$;

create or replace function recovery_rotate(p_member_id uuid, p_new_hash text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.members set recovery_code_hash = p_new_hash where id = p_member_id;
$$;

/* anon, not just authenticated: every one of these runs before the member has
   a session. Each returns only what its screen needs, and the two that match
   on a digest are useless without the code itself. */
grant execute on function claim_code_peek(text)                     to anon, authenticated;
grant execute on function claim_code_verify(text, text)             to anon, authenticated;
grant execute on function claim_code_complete(text, uuid, uuid, text) to anon, authenticated;
grant execute on function recovery_lookup(text, text)               to anon, authenticated;
grant execute on function recovery_rotate(uuid, text)               to anon, authenticated;
