-- ============================================================================
-- 0015 · Reports (A-30 revenue, A-31 retention, A-32 attendance).
--
-- One function, one round trip, same reasoning as dashboard_summary: a report
-- page issuing a dozen aggregates is the screen an owner leaves open, and each
-- of those queries would re-evaluate RLS across the whole payments table.
--
-- SECURITY INVOKER, deliberately. Reports are the most sensitive read in the
-- product — revenue, per-plan pricing, who is leaving — and the permission
-- matrix already says who may see them (owner and accountant; a manager sees
-- no reports module at all). Running as the caller means that decision is
-- enforced by RLS rather than restated here.
--
-- Everything is bounded to a window the caller passes, so "last 6 months" and
-- "this financial year" are the same code path.
-- ============================================================================

create or replace function reports_summary(
  p_gym_id uuid,
  p_months integer default 6
)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with
  bounds as (
    select
      (date_trunc('month', current_date)
        - make_interval(months => greatest(p_months, 1) - 1))::date as from_date,
      (date_trunc('month', current_date)
        + interval '1 month')::date                                 as to_date
  ),

  -- ── revenue, by month ────────────────────────────────────────────────────
  -- Zero-filled from a generated series: a month with no takings must appear
  -- as a zero bar, not vanish and make a bad quarter look like a short one.
  months as (
    select generate_series(
      (select from_date from bounds),
      (select to_date from bounds) - interval '1 day',
      interval '1 month'
    )::date as m
  ),
  revenue as (
    select
      to_char(months.m, 'Mon YY') as label,
      months.m                    as month,
      coalesce(sum(p.amount_paise) filter (where p.status = 'paid'), 0)::bigint
                                  as paise,
      count(*) filter (where p.status = 'paid')::int as payments
    from months
    left join public.payments p
      on p.gym_id = p_gym_id
     and p.status = 'paid'
     and p.paid_at >= months.m
     and p.paid_at <  months.m + interval '1 month'
    group by months.m
    order by months.m
  ),

  -- ── revenue by plan, over the window ─────────────────────────────────────
  by_plan as (
    select
      coalesce(pl.name, 'Other')                    as name,
      coalesce(sum(p.amount_paise), 0)::bigint      as paise,
      count(*)::int                                 as n
    from public.payments p
    left join public.memberships ms on ms.id = p.membership_id
    left join public.plans pl       on pl.id = ms.plan_id
    where p.gym_id = p_gym_id
      and p.status = 'paid'
      and p.paid_at >= (select from_date from bounds)
    group by 1
    order by 2 desc
  ),

  -- ── payment method mix ───────────────────────────────────────────────────
  -- Drives a real decision: a gym still taking 80% cash does not need the
  -- Razorpay integration yet, however much the roadmap wants it.
  by_method as (
    select
      p.method::text                            as method,
      coalesce(sum(p.amount_paise), 0)::bigint  as paise,
      count(*)::int                             as n
    from public.payments p
    where p.gym_id = p_gym_id
      and p.status = 'paid'
      and p.paid_at >= (select from_date from bounds)
    group by 1
    order by 2 desc
  ),

  -- ── retention ────────────────────────────────────────────────────────────
  -- A renewal is a membership row whose renewed_from points at an earlier
  -- term; that column exists precisely because the first implementation
  -- overwrote the row and destroyed the history this query needs.
  terms as (
    select
      date_trunc('month', ms.started_on)::date as m,
      count(*)::int                            as started,
      count(*) filter (where ms.renewed_from is not null)::int as renewals
    from public.memberships ms
    where ms.gym_id = p_gym_id
      and ms.started_on >= (select from_date from bounds)
    group by 1
  ),
  retention as (
    select jsonb_agg(jsonb_build_object(
      'label',    to_char(t.m, 'Mon YY'),
      'started',  t.started,
      'renewals', t.renewals,
      'new',      t.started - t.renewals
    ) order by t.m) as x
    from terms t
  ),

  -- Churn: memberships that ended in the window and were never followed by a
  -- new term for that member. Counted per member, not per row, so someone who
  -- lapsed twice is one lost member.
  churn as (
    select count(distinct ms.member_id)::int as n
    from public.memberships ms
    where ms.gym_id = p_gym_id
      and ms.status in ('expired', 'cancelled')
      and ms.expires_on >= (select from_date from bounds)
      and not exists (
        select 1 from public.memberships later
        where later.member_id = ms.member_id
          and later.started_on > ms.expires_on
      )
  ),

  -- ── attendance ───────────────────────────────────────────────────────────
  attendance_days as (
    select
      to_char(d.day, 'Dy')                              as dow_label,
      extract(isodow from d.day)::int                   as dow,
      count(a.id)::int                                  as n
    from generate_series(current_date - 27, current_date, interval '1 day') as d(day)
    left join public.attendance a
      on a.gym_id = p_gym_id
     and a.checked_in_at >= d.day
     and a.checked_in_at <  d.day + interval '1 day'
    group by 1, 2
  ),
  by_weekday as (
    select jsonb_agg(jsonb_build_object('label', x.dow_label, 'n', x.n)
                     order by x.dow) as x
    from (
      select dow_label, dow, sum(n)::int as n
      from attendance_days group by dow_label, dow
    ) x
  ),
  by_hour as (
    select jsonb_agg(jsonb_build_object('hour', h.hour, 'n', coalesce(c.n, 0))
                     order by h.hour) as x
    from generate_series(5, 22) as h(hour)
    left join (
      select extract(hour from a.checked_in_at at time zone 'Asia/Kolkata')::int as hour,
             count(*)::int as n
      from public.attendance a
      where a.gym_id = p_gym_id
        and a.checked_in_at >= current_date - 27
      group by 1
    ) c on c.hour = h.hour
  ),

  -- Visits per active member over four weeks. The number a gym owner argues
  -- with, and the one that predicts renewals better than headcount does.
  engagement as (
    select
      count(distinct a.member_id)::int as visitors,
      count(a.id)::int                 as visits
    from public.attendance a
    where a.gym_id = p_gym_id
      and a.checked_in_at >= current_date - 27
  ),
  active_now as (
    select count(*)::int as n
    from public.memberships ms
    where ms.gym_id = p_gym_id
      and ms.status in ('active', 'expiring')
  )

  select jsonb_build_object(
    'months',      greatest(p_months, 1),
    'from',        (select from_date from bounds),
    'revenue',     coalesce((select jsonb_agg(jsonb_build_object(
                       'label', r.label, 'paise', r.paise, 'payments', r.payments
                     ) order by r.month) from revenue r), '[]'::jsonb),
    'by_plan',     coalesce((select jsonb_agg(jsonb_build_object(
                       'name', b.name, 'paise', b.paise, 'n', b.n
                     )) from by_plan b), '[]'::jsonb),
    'by_method',   coalesce((select jsonb_agg(jsonb_build_object(
                       'method', b.method, 'paise', b.paise, 'n', b.n
                     )) from by_method b), '[]'::jsonb),
    'retention',   coalesce((select x from retention), '[]'::jsonb),
    'churned',     (select n from churn),
    'by_weekday',  coalesce((select x from by_weekday), '[]'::jsonb),
    'by_hour',     coalesce((select x from by_hour), '[]'::jsonb),
    'visitors',    (select visitors from engagement),
    'visits',      (select visits from engagement),
    'active',      (select n from active_now)
  );
$$;

comment on function reports_summary(uuid, integer) is
  'A-30/A-31/A-32 in one round trip. SECURITY INVOKER — RLS decides who sees revenue.';

grant execute on function reports_summary(uuid, integer) to authenticated;
