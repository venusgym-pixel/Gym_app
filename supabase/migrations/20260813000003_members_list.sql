-- ============================================================================
-- 0010 · Members list (A-02).
--
-- Two reasons this is a function rather than a PostgREST embed:
--
--   1. days_left must be computed against the DATABASE's date, not the web
--      server's. A membership expiring today in Asia/Kolkata reads as
--      tomorrow if the Node process happens to run in UTC — and "1 day left"
--      on a membership that has actually lapsed is how someone gets turned
--      away at the door after the screen said they were fine.
--
--   2. Filtering by membership status through an embed drops parents rather
--      than excluding them, so a lapsed member silently disappears from
--      "All" instead of appearing with an Expired chip.
--
-- SECURITY INVOKER (the default): RLS still decides which rows come back.
-- ============================================================================

create or replace function members_list(
  p_gym_id uuid,
  p_status text default null,     -- 'active' | 'expiring' | 'expired' | null
  p_search text default null
)
returns table (
  id           uuid,
  member_code  text,
  full_name    text,
  phone        text,
  joined_on    date,
  is_active    boolean,
  plan_name    text,
  status       membership_status,
  expires_on   date,
  days_left    integer
)
language sql
stable
set search_path = ''
as $$
  with latest as (
    -- One row per member: the term with the furthest expiry is the live one.
    select distinct on (ms.member_id)
           ms.member_id, ms.status, ms.expires_on, ms.plan_id
      from public.memberships ms
     where ms.gym_id = p_gym_id
     order by ms.member_id, ms.expires_on desc
  )
  select
    m.id,
    m.member_code,
    m.full_name,
    m.phone,
    m.joined_on,
    m.is_active,
    pl.name                                as plan_name,
    l.status,
    l.expires_on,
    (l.expires_on - current_date)::integer as days_left
  from public.members m
  left join latest l    on l.member_id = m.id
  left join public.plans pl on pl.id = l.plan_id
  where m.gym_id = p_gym_id
    and (p_status is null or l.status::text = p_status)
    and (
      p_search is null or p_search = ''
      or m.full_name   ilike '%' || p_search || '%'
      or m.phone       ilike '%' || p_search || '%'
      or m.member_code ilike '%' || p_search || '%'
    )
  order by m.full_name;
$$;

revoke execute on function members_list(uuid, text, text) from public, anon;
grant  execute on function members_list(uuid, text, text) to authenticated, service_role;
