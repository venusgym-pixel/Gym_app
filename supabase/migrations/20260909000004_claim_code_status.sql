-- Tell a member which of the four things actually happened to their code.
--
-- /join had one answer for every failure: "This code has expired. Codes last
-- 24 hours and work once. Ask at the front desk for a new one." It is right
-- about a code that timed out and wrong about everything else, and the two
-- common cases are the ones it gets wrong:
--
--   · The member finished setting up, pressed back or re-scanned the QR still
--     on the counter screen, and was sent to the desk to fix an account that
--     already works. They should sign in.
--
--   · Reception tapped "New code" — which quietly kills the previous one — so
--     the QR the member is looking at is dead while a live one is on screen
--     two feet away. "Expired" sends them out of the building.
--
-- The single message was defended as not being an oracle, and for the second
-- factor that reasoning holds: telling a wrong code from wrong digits would
-- say which codes are live. It does not hold here. Reaching any of these
-- answers means already holding a real six-character code out of about 10^9,
-- and what it discloses is whether that code you were given still works.

-- ── superseded is not used ──────────────────────────────────────────────────
--
-- Re-issuing marked the old code used_at, so a code spent by a successful
-- claim and one replaced before anyone touched it were indistinguishable
-- afterwards — including to the screen trying to explain itself. Same effect,
-- separate column.

alter table member_claim_codes
  add column if not exists superseded_at timestamptz;

comment on column member_claim_codes.superseded_at is
  'Set when reception issued a newer code for this member. Blocks the code '
  'exactly as used_at does; kept apart so /join can say which happened.';


/* Return type changes, so it has to be dropped rather than replaced. */
drop function if exists claim_code_peek(text);

/**
 * What the /join screen shows before anyone has proved anything.
 *
 * Always exactly one row, so the caller never has to read an empty result as
 * an unexplained failure. The member's details come back only with 'ok' — a
 * code found on the floor should not name the person it belongs to, whatever
 * state it is in.
 */
create function claim_code_peek(p_hash text)
returns table (
  status       text,
  member_id    uuid,
  gym_id       uuid,
  full_name    text,
  gym_name     text,
  masked_phone text
)
language sql
stable
security definer
set search_path = ''
as $fn$
  with found as (
    select c.*, m.full_name, m.phone, g.name as gym_name
      from public.member_claim_codes c
      join public.members m on m.id = c.member_id
      join public.gyms g    on g.id = c.gym_id
     where c.code_hash = p_hash
  ),
  state as (
    select
      case
        when not exists (select 1 from found)                    then 'unknown'
        when (select superseded_at from found) is not null       then 'superseded'
        when (select used_at from found)       is not null       then 'used'
        when (select expires_at from found)    <= now()          then 'expired'
        else 'ok'
      end as status
  )
  select
    state.status,
    case when state.status = 'ok' then (select member_id from found) end,
    case when state.status = 'ok' then (select gym_id    from found) end,
    case when state.status = 'ok' then (select full_name from found) end,
    case when state.status = 'ok' then (select gym_name  from found) end,
    case when state.status = 'ok' then
      -- Never the whole number: a code found on the floor should not hand
      -- over someone's phone number.
      '+91 ' || substr(regexp_replace((select phone from found), '\D', '', 'g'), 3, 5) || ' •• ••'
    end
  from state;
$fn$;


/**
 * The second factor. Returns nothing unless the last four digits match.
 *
 * Superseded codes have to be refused here too. Splitting the column without
 * this line would quietly bring every replaced code back to life, which is
 * the opposite of what re-issuing is for.
 */
create or replace function claim_code_verify(p_hash text, p_last4 text)
returns table (member_id uuid, gym_id uuid, user_id uuid, phone text, full_name text)
language sql
stable
security definer
set search_path = ''
as $fn$
  select c.member_id, c.gym_id, m.user_id, m.phone, m.full_name
    from public.member_claim_codes c
    join public.members m on m.id = c.member_id
   where c.code_hash = p_hash
     and c.used_at is null
     and c.superseded_at is null
     and c.expires_at > now()
     and length(p_last4) = 4
     and right(m.phone, 4) = p_last4;
$fn$;


/** Same guard on the write that finishes the claim. */
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
as $fn$
declare
  v_gym uuid;
begin
  select gym_id into v_gym
    from public.member_claim_codes
   where code_hash = p_hash
     and used_at is null
     and superseded_at is null
     and expires_at > now();

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
$fn$;

grant execute on function claim_code_peek(text) to anon, authenticated;
