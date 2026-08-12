-- ============================================================================
-- 0007 · Scheduled jobs.
--
-- The twelve logical jobs in docs/end-to-end-flow.md §3 collapse into three
-- pg_cron entries that fan out internally. Three, not twelve, because
-- Cloudflare caps cron triggers at five and Vercel Hobby at one per day —
-- staying at three keeps the scheduler portable if hosting ever moves.
--
-- Everything here runs INSIDE Postgres, next to the data. No network hop, no
-- vendor, and the reminder ladder cannot be silently switched off by an
-- expired API key.
-- ============================================================================

-- ── 1. membership status sweep ──────────────────────────────────────────────

/*
  Active -> Expiring (30 days out) -> Expired, and unfreezes memberships whose
  pause has elapsed.

  'expiring' is a real status rather than a computed view because the admin
  worklist (A-11) and the member's home banner both key off it, and because a
  gym owner filtering "expiring" should get the same set the reminder engine
  is acting on.
*/
create or replace function job_sweep_membership_status(p_today date default current_date)
returns table (expiring integer, expired integer, unfrozen integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_expiring integer;
  v_expired  integer;
  v_unfrozen integer;
begin
  with done as (
    update public.memberships m
       set status = 'active', updated_at = now()
      from public.membership_freezes f
     where f.membership_id = m.id
       and m.status = 'frozen'
       and f.starts_on + f.days <= p_today
    returning m.id)
  select count(*)::integer into v_unfrozen from done;

  with e as (
    update public.memberships
       set status = 'expiring', updated_at = now()
     where status = 'active'
       and expires_on >= p_today
       and expires_on <= p_today + 30
    returning id)
  select count(*)::integer into v_expiring from e;

  with x as (
    update public.memberships
       set status = 'expired', updated_at = now()
     where status in ('active', 'expiring')
       and expires_on < p_today
    returning id)
  select count(*)::integer into v_expired from x;

  return query select v_expiring, v_expired, v_unfrozen;
end;
$$;


-- ── 2. the renewal ladder ───────────────────────────────────────────────────

/*
  For each active rule, find memberships whose expiry is exactly offset_days
  away and enqueue one message per configured channel.

  "Exactly" matters: a range would re-send every day. The outbox unique index
  is the second line of defence, but the query should be right on its own.

  Frozen and cancelled memberships are skipped — chasing someone to renew a
  membership they deliberately paused is how gyms lose members.
*/
create or replace function job_run_reminder_ladder(p_today date default current_date)
returns table (queued integer, skipped integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  r        record;
  ch       public.notification_channel;
  v_id     uuid;
  v_queued integer := 0;
  v_skip   integer := 0;
begin
  for r in
    select ms.id as membership_id, ms.member_id, ms.gym_id, ms.expires_on,
           rr.key as rule_key, rr.channels,
           m.full_name, p.name as plan_name, g.name as gym_name,
           p.price_paise
      from public.reminder_rules rr
      join public.memberships ms
        on ms.gym_id = rr.gym_id
       and ms.expires_on = p_today - rr.offset_days
      join public.members m on m.id = ms.member_id
      join public.plans   p on p.id = ms.plan_id
      join public.gyms    g on g.id = ms.gym_id
     where rr.is_active
       and ms.status in ('active', 'expiring', 'expired')
       and m.is_active
       and g.is_active
  loop
    foreach ch in array r.channels loop
      v_id := public.enqueue_notification(
        r.gym_id, r.member_id, r.membership_id, r.rule_key, ch, p_today,
        jsonb_build_object(
          'name',   split_part(r.full_name, ' ', 1),
          'plan',   r.plan_name,
          'gym',    r.gym_name,
          'expiry', to_char(r.expires_on, 'DD Mon YYYY'),
          'days',   abs(r.expires_on - p_today)::text,
          'amount', '₹' || to_char(r.price_paise / 100.0, 'FM99,99,999')
        ));
      if v_id is null then v_skip := v_skip + 1;
      else v_queued := v_queued + 1;
      end if;
    end loop;
  end loop;

  return query select v_queued, v_skip;
end;
$$;


-- ── 3. inactivity ───────────────────────────────────────────────────────────

/*
  §2.7. Fires at exactly 7 and 14 days since the last visit.

  A member who has NEVER checked in is excluded: days_since_last_visit()
  returns null for them, and treating null as "infinitely inactive" would
  blast a re-engagement message at everyone who joined yesterday.

  Beyond 21 days the design deliberately sends nothing automatic — that case
  gets a human call task instead.
*/
create or replace function job_scan_inactivity(p_today date default current_date)
returns table (queued integer, at_risk integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  r        record;
  v_id     uuid;
  v_queued integer := 0;
  v_risk   integer := 0;
begin
  for r in
    select m.id as member_id, m.gym_id, m.full_name, ms.id as membership_id,
           public.days_since_last_visit(m.gym_id, m.id) as gap,
           g.name as gym_name
      from public.members m
      join public.memberships ms
        on ms.member_id = m.id and ms.status in ('active', 'expiring')
      join public.gyms g on g.id = m.gym_id
     where m.is_active and g.is_active
  loop
    if r.gap is null then
      continue;                                   -- never visited; not "absent"
    end if;

    if r.gap >= 14 then
      v_risk := v_risk + 1;
    end if;

    if r.gap in (7, 14) then
      v_id := public.enqueue_notification(
        r.gym_id, r.member_id, r.membership_id,
        'inactive_' || r.gap || 'd', 'whatsapp', p_today,
        jsonb_build_object(
          'name', split_part(r.full_name, ' ', 1),
          'gym',  r.gym_name,
          'days', r.gap::text));
      if v_id is not null then v_queued := v_queued + 1; end if;
    end if;
  end loop;

  return query select v_queued, v_risk;
end;
$$;


-- ── the daily fan-out ───────────────────────────────────────────────────────

-- One cron entry, three jobs, deterministic order: status must settle before
-- the ladder reads it, or a membership that expired overnight is chased with
-- the wrong template.
create or replace function job_daily(p_today date default current_date)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sweep record;
  v_ladder record;
  v_inact record;
begin
  select * into v_sweep  from public.job_sweep_membership_status(p_today);
  select * into v_ladder from public.job_run_reminder_ladder(p_today);
  select * into v_inact  from public.job_scan_inactivity(p_today);

  return jsonb_build_object(
    'date', p_today,
    'sweep',      jsonb_build_object('expiring', v_sweep.expiring,
                                     'expired',  v_sweep.expired,
                                     'unfrozen', v_sweep.unfrozen),
    'reminders',  jsonb_build_object('queued', v_ladder.queued,
                                     'deduped', v_ladder.skipped),
    'inactivity', jsonb_build_object('queued', v_inact.queued,
                                     'at_risk', v_inact.at_risk));
end;
$$;


-- ── the drain worker's claim ────────────────────────────────────────────────

/*
  Claims a batch for sending. FOR UPDATE SKIP LOCKED means two workers running
  at once never grab the same row — which will matter the first time a retry
  sweep overlaps a slow send.

  Rows are marked 'sending' on claim, so a worker that dies mid-flight leaves
  them visible for the stuck-message reaper rather than silently lost.
*/
create or replace function claim_outbox_batch(p_limit integer default 50)
returns setof notification_outbox
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  with claimed as (
    select o.id
      from public.notification_outbox o
     where o.status in ('queued', 'failed')
       and o.attempts < 3
       and o.next_attempt_at <= now()
     order by o.next_attempt_at
     limit p_limit
     for update skip locked
  )
  update public.notification_outbox o
     set status = 'sending', attempts = o.attempts + 1, updated_at = now()
    from claimed c
   where o.id = c.id
  returning o.*;
end;
$$;

/* Backoff: 1 min, then 5, then 25. Three attempts, then it stays 'failed' and
   shows up in A-37 for a human. */
create or replace function mark_outbox_result(
  p_id       uuid,
  p_ok       boolean,
  p_provider_message_id text default null,
  p_error    text default null
)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.notification_outbox
     -- Explicit cast: a CASE yields text, and the column is an enum.
     set status = (case when p_ok then 'sent' else 'failed' end)::public.notification_status,
         sent_at = case when p_ok then now() else sent_at end,
         provider_message_id = coalesce(p_provider_message_id, provider_message_id),
         error = case when p_ok then null else p_error end,
         next_attempt_at = case
           when p_ok then next_attempt_at
           else now() + (interval '1 minute' * power(5, attempts - 1))
         end,
         updated_at = now()
   where id = p_id;
$$;

-- A worker killed mid-send leaves rows stuck in 'sending'. Put them back.
create or replace function job_requeue_stuck(p_older_than interval default interval '10 minutes')
returns integer
language sql
security definer
set search_path = ''
as $$
  with r as (
    update public.notification_outbox
       set status = 'queued', updated_at = now()
     where status = 'sending' and updated_at < now() - p_older_than
    returning id)
  select count(*)::integer from r;
$$;


-- ── schedule ────────────────────────────────────────────────────────────────
--
-- Three entries. The daily one runs at 03:30 UTC = 09:00 Asia/Kolkata, the
-- default gym reminder hour; per-gym hours are honoured by the drain worker
-- holding messages until the gym's local hour, not by scheduling per gym.
--
-- Wrapped in a DO block: pg_cron is unavailable in the test harness, and a
-- missing extension must not stop the migration from applying.

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('fitwell-daily',   '30 3 * * *', $cron$ select public.job_daily(); $cron$);
    perform cron.schedule('fitwell-hourly',  '0 * * * *',  $cron$ select public.job_requeue_stuck(); $cron$);
    perform cron.schedule('fitwell-drain',   '*/2 * * * *',
      $cron$ select net.http_post(
               url := current_setting('app.jobs_url', true) || '/drain',
               headers := jsonb_build_object('x-cron-secret', current_setting('app.cron_secret', true))
             ); $cron$);
  end if;
end;
$$;


-- ── RLS ─────────────────────────────────────────────────────────────────────
-- These functions are SECURITY DEFINER and run as the owner, so they must be
-- callable only by the service role — never by a signed-in user.

revoke execute on function job_daily(date)                       from public, anon, authenticated;
revoke execute on function job_sweep_membership_status(date)     from public, anon, authenticated;
revoke execute on function job_run_reminder_ladder(date)         from public, anon, authenticated;
revoke execute on function job_scan_inactivity(date)             from public, anon, authenticated;
revoke execute on function claim_outbox_batch(integer)           from public, anon, authenticated;
revoke execute on function mark_outbox_result(uuid, boolean, text, text)
                                                                 from public, anon, authenticated;
revoke execute on function job_requeue_stuck(interval)           from public, anon, authenticated;

grant execute on function job_daily(date)                        to service_role;
grant execute on function job_sweep_membership_status(date)      to service_role;
grant execute on function job_run_reminder_ladder(date)          to service_role;
grant execute on function job_scan_inactivity(date)              to service_role;
grant execute on function claim_outbox_batch(integer)            to service_role;
grant execute on function mark_outbox_result(uuid, boolean, text, text) to service_role;
grant execute on function job_requeue_stuck(interval)            to service_role;
