-- ============================================================================
-- Let a member do a different day, without the split quietly drifting.
--
-- Two changes to todays_workout, and the first is the reason for the second.
--
-- 1 · The next day was derived from HOW MANY sessions were completed:
--     day_index = (count % day_count) + 1. That is correct only while the
--     member always does what they were offered. The moment they can choose
--     — and this migration exists to let them — it breaks: on a three-day
--     push/pull/legs split, a member offered Push who does Legs instead gets
--     offered Pull next, because the count advanced by one regardless. Push is
--     silently skipped, and nothing anywhere says so.
--
--     It now follows the LAST COMPLETED day instead: whatever you actually
--     did, the next one is the one after it. Choosing becomes a swap rather
--     than a hole in the rotation. With no history it starts at day 1, as
--     before.
--
--     This also fixes the same drift for anyone who ever logged a session
--     outside the offered day, which was already possible — start_workout_session
--     has always accepted any day_id.
--
-- 2 · The plan's whole day list comes back with it, so the member screen can
--     offer the alternatives without a second round trip on a phone.
--
-- Rotating by session rather than by weekday was already right and is
-- untouched: a split anchored to weekdays means missing Tuesday costs you the
-- Tuesday workout, which is what makes people abandon a programme.
-- ============================================================================

create or replace function todays_workout(p_gym_id uuid, p_member_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with live as (
    select wa.plan_id, wp.name as plan_name, wa.starts_on
      from public.workout_assignments wa
      join public.workout_plans wp on wp.id = wa.plan_id
     where wa.gym_id = p_gym_id
       and wa.member_id = p_member_id
       and wa.ends_on is null
     limit 1
  ),
  day_count as (
    select count(*)::int as n from public.workout_days wd, live
     where wd.plan_id = live.plan_id
  ),
  -- The day the member last actually finished, which is what the next one
  -- follows from. Joined through workout_days so a session logged against a
  -- day that has since been deleted (day_id goes null) is simply ignored
  -- rather than stopping the rotation dead.
  last_done as (
    select wd.day_index
      from public.workout_sessions s
      join public.workout_days wd on wd.id = s.day_id
      join live on live.plan_id = wd.plan_id
     where s.gym_id = p_gym_id
       and s.member_id = p_member_id
       and s.completed_at is not null
     order by s.completed_at desc
     limit 1
  ),
  today as (
    select wd.*
      from public.workout_days wd, live, day_count
     where wd.plan_id = live.plan_id
       and day_count.n > 0
       and wd.day_index = coalesce(
             ((select day_index from last_done) % day_count.n) + 1,
             1)
     limit 1
  ),
  -- Every day in the plan, for the "something else today" list.
  all_days as (
    select jsonb_agg(
             jsonb_build_object(
               'day_id',    wd.id,
               'day_index', wd.day_index,
               'name',      wd.name,
               'exercises', (select count(*) from public.workout_exercises we
                              where we.day_id = wd.id)
             ) order by wd.day_index) as rows
      from public.workout_days wd, live
     where wd.plan_id = live.plan_id
  ),
  items as (
    select jsonb_agg(
             jsonb_build_object(
               'exercise_id', e.id,
               'name',        e.name,
               'muscle',      e.primary_muscle,
               'equipment',   e.equipment,
               'sets',        we.sets,
               'target_reps', we.target_reps,
               'target_weight_kg', we.target_weight_kg,
               'rest_seconds',     we.rest_seconds,
               'position',    we.position,
               'last', (
                 select jsonb_build_object('reps', sl.reps, 'weight_kg', sl.weight_kg,
                                           'logged_at', sl.logged_at)
                   from public.set_logs sl
                   join public.workout_sessions ws on ws.id = sl.session_id
                  where sl.exercise_id = e.id
                    and ws.member_id = p_member_id
                    and ws.gym_id = p_gym_id
                  order by sl.logged_at desc
                  limit 1
               )
             ) order by we.position) as rows
      from public.workout_exercises we
      join public.exercises e on e.id = we.exercise_id
      join today on today.id = we.day_id
  )
  select case
    when not exists (select 1 from live) then
      jsonb_build_object('assigned', false)
    else
      jsonb_build_object(
        'assigned',  true,
        'plan_name', (select plan_name from live),
        'day_id',    (select id from today),
        'day_name',  (select name from today),
        'day_index', (select day_index from today),
        'day_count', (select n from day_count),
        'days',      coalesce((select rows from all_days), '[]'::jsonb),
        'exercises', coalesce((select rows from items), '[]'::jsonb),
        'open_session_id', (
          select s.id from public.workout_sessions s
           where s.gym_id = p_gym_id and s.member_id = p_member_id
             and s.completed_at is null
           order by s.started_at desc limit 1)
      )
  end;
$$;

-- Returns one day's exercises, for when the member picks a different one. The
-- same shape as todays_workout's `exercises`, so the logger needs no second
-- code path for a chosen day versus the offered one.
create or replace function workout_day_detail(
  p_gym_id uuid, p_member_id uuid, p_day_id uuid
)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'day_id',   wd.id,
    'day_name', wd.name,
    'day_index', wd.day_index,
    'exercises', coalesce((
      select jsonb_agg(
               jsonb_build_object(
                 'exercise_id', e.id,
                 'name',        e.name,
                 'muscle',      e.primary_muscle,
                 'equipment',   e.equipment,
                 'sets',        we.sets,
                 'target_reps', we.target_reps,
                 'target_weight_kg', we.target_weight_kg,
                 'rest_seconds',     we.rest_seconds,
                 'position',    we.position,
                 'last', (
                   select jsonb_build_object('reps', sl.reps, 'weight_kg', sl.weight_kg,
                                             'logged_at', sl.logged_at)
                     from public.set_logs sl
                     join public.workout_sessions ws on ws.id = sl.session_id
                    where sl.exercise_id = e.id
                      and ws.member_id = p_member_id
                      and ws.gym_id = p_gym_id
                    order by sl.logged_at desc
                    limit 1
                 )
               ) order by we.position)
        from public.workout_exercises we
        join public.exercises e on e.id = we.exercise_id
       where we.day_id = wd.id
    ), '[]'::jsonb)
  )
  from public.workout_days wd
  /* The member must be assigned the plan this day belongs to. Not decoration:
     this is SQL, callable directly, and without it any member could read any
     other plan's programming by guessing a day id. */
  where wd.id = p_day_id
    and wd.gym_id = p_gym_id
    and exists (
      select 1 from public.workout_assignments wa
       where wa.plan_id = wd.plan_id
         and wa.member_id = p_member_id
         and wa.gym_id = p_gym_id
         and wa.ends_on is null
    );
$$;

revoke execute on function workout_day_detail(uuid, uuid, uuid) from public, anon;
grant execute on function workout_day_detail(uuid, uuid, uuid) to authenticated;
