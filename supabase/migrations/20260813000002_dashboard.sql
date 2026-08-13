-- ============================================================================
-- 0009 · Dashboard summary (A-01).
--
-- One function, one round trip. The dashboard shows eight tiles and three
-- worklists; issuing eleven queries from the server component would make the
-- slowest screen in the product the one the owner opens first every morning.
--
-- Deliberately SECURITY INVOKER (the default): it runs as the caller, so RLS
-- filters every table it touches. A receptionist calling it sees the same
-- numbers as the owner because both hold scope 'all' on those modules; a
-- member calling it gets zeros rather than someone else's revenue.
-- ============================================================================

create or replace function dashboard_summary(p_gym_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with
  member_counts as (
    select
      count(*) filter (where m.is_active)                       as total,
      count(*) filter (where m.joined_on >= date_trunc('month', current_date)) as new_this_month
    from public.members m
    where m.gym_id = p_gym_id
  ),
  membership_counts as (
    select
      count(*) filter (where ms.status = 'active')   as active,
      count(*) filter (where ms.status = 'expiring') as expiring,
      count(*) filter (where ms.status = 'expired')  as expired,
      count(*) filter (where ms.status = 'frozen')   as frozen
    from public.memberships ms
    where ms.gym_id = p_gym_id
  ),
  money as (
    select
      coalesce(sum(p.amount_paise) filter (
        where p.status = 'paid' and p.paid_at >= date_trunc('month', current_date)
      ), 0)::bigint as revenue_month,
      coalesce(sum(p.amount_paise) filter (
        where p.status = 'paid' and p.paid_at::date = current_date
      ), 0)::bigint as revenue_today,
      coalesce(sum(p.amount_paise) filter (where p.status = 'pending'), 0)::bigint
        as pending_paise,
      count(*) filter (where p.status = 'pending')::int as pending_count
    from public.payments p
    where p.gym_id = p_gym_id
  ),
  today_attendance as (
    select count(*)::int as n
    from public.attendance a
    where a.gym_id = p_gym_id
      and a.checked_in_at >= date_trunc('day', now())
  ),
  -- Fourteen days of attendance for the sparkline, zero-filled so a quiet
  -- day is a gap in the chart rather than a missing bar that shifts the axis.
  attendance_series as (
    select jsonb_agg(jsonb_build_object('d', d.day, 'n', coalesce(c.n, 0))
                     order by d.day) as series
    from generate_series(current_date - 13, current_date, interval '1 day') as d(day)
    left join (
      select a.checked_in_at::date as day, count(*)::int as n
      from public.attendance a
      where a.gym_id = p_gym_id
        and a.checked_in_at >= current_date - 13
      group by 1
    ) c on c.day = d.day::date
  ),
  -- The renewal worklist: who to chase, soonest first.
  expiring_soon as (
    select jsonb_agg(s.x order by s.days_left) as rows
    from (
      select jsonb_build_object(
               'member_id',  m.id,
               'name',       m.full_name,
               'phone',      m.phone,
               'plan',       pl.name,
               'expires_on', ms.expires_on,
               'days_left',  (ms.expires_on - current_date)
             ) as x,
             (ms.expires_on - current_date) as days_left
        from public.memberships ms
        join public.members m  on m.id = ms.member_id
        join public.plans   pl on pl.id = ms.plan_id
       where ms.gym_id = p_gym_id
         and ms.status in ('active', 'expiring')
         and ms.expires_on between current_date and current_date + 30
       order by ms.expires_on
       limit 8
    ) s
  ),
  -- Members at risk. A member who has never visited is excluded: null is not
  -- "infinitely absent", and treating it so would flag everyone who joined
  -- this week.
  at_risk as (
    select jsonb_agg(s.x order by s.gap desc) as rows
    from (
      select jsonb_build_object(
               'member_id', m.id,
               'name',      m.full_name,
               'phone',     m.phone,
               'days_since', public.days_since_last_visit(p_gym_id, m.id),
               'days_left',  (ms.expires_on - current_date)
             ) as x,
             public.days_since_last_visit(p_gym_id, m.id) as gap
        from public.members m
        join public.memberships ms
          on ms.member_id = m.id and ms.status in ('active', 'expiring')
       where m.gym_id = p_gym_id
         and m.is_active
         and public.days_since_last_visit(p_gym_id, m.id) >= 7
       order by gap desc
       limit 6
    ) s
  ),
  outbox as (
    select
      count(*) filter (where o.status in ('queued', 'sending'))::int as queued,
      count(*) filter (where o.status = 'failed' and o.attempts >= 3)::int as stuck,
      count(*) filter (where o.status = 'sent'
                         and o.sent_at >= date_trunc('day', now()))::int as sent_today
    from public.notification_outbox o
    where o.gym_id = p_gym_id
  )
  select jsonb_build_object(
    'members', jsonb_build_object(
      'total',          (select total from member_counts),
      'new_this_month', (select new_this_month from member_counts),
      'active',         (select active from membership_counts),
      'expiring',       (select expiring from membership_counts),
      'expired',        (select expired from membership_counts),
      'frozen',         (select frozen from membership_counts)
    ),
    'money', jsonb_build_object(
      'revenue_month_paise', (select revenue_month from money),
      'revenue_today_paise', (select revenue_today from money),
      'pending_paise',       (select pending_paise from money),
      'pending_count',       (select pending_count from money)
    ),
    'attendance', jsonb_build_object(
      'today',  (select n from today_attendance),
      'series', coalesce((select series from attendance_series), '[]'::jsonb)
    ),
    'expiring_soon', coalesce((select rows from expiring_soon), '[]'::jsonb),
    'at_risk',       coalesce((select rows from at_risk), '[]'::jsonb),
    'outbox', jsonb_build_object(
      'queued',     (select queued from outbox),
      'stuck',      (select stuck from outbox),
      'sent_today', (select sent_today from outbox)
    )
  );
$$;

revoke execute on function dashboard_summary(uuid) from public, anon;
grant  execute on function dashboard_summary(uuid) to authenticated, service_role;

comment on function dashboard_summary is
  'A-01 in a single round trip. SECURITY INVOKER so RLS still applies to '
  'every table it reads — the p_gym_id argument narrows, it does not grant.';
