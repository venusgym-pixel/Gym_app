-- ============================================================================
-- 0012 · The coaching loop.
--
-- docs/end-to-end-flow.md §2.4 — the thing that makes this a platform rather
-- than a membership database:
--
--   trainer builds a plan -> assigns it -> member logs every set ->
--   trainer sees actual vs prescribed -> adjusts next week
--
-- Two decisions shape the whole schema:
--
--   1. A workout session stores what was PRESCRIBED as well as what was
--      DONE. Reading the plan at review time would lie: the plan may have
--      been edited since, and "did they hit the target" needs the target as
--      it stood that day.
--
--   2. Set logs are rows, not a JSON blob. Progression, personal bests and
--      volume are all aggregate queries, and a blob makes every one of them
--      a full scan plus application-side parsing.
-- ============================================================================

-- ── who coaches whom ────────────────────────────────────────────────────────

create table trainer_clients (
  id          uuid primary key default gen_random_uuid(),
  gym_id      uuid not null references gyms(id) on delete cascade,
  trainer_id  uuid not null references profiles(id) on delete cascade,
  member_id   uuid not null references members(id) on delete cascade,
  assigned_on date not null default current_date,
  ended_on    date,
  notes       text,
  created_at  timestamptz not null default now(),
  unique (gym_id, trainer_id, member_id)
);

create index trainer_clients_trainer_idx
  on trainer_clients (gym_id, trainer_id) where ended_on is null;
create index trainer_clients_member_idx
  on trainer_clients (gym_id, member_id) where ended_on is null;

comment on table trainer_clients is
  'The link the permission matrix means by scope = ''assigned''. A trainer '
  'sees a member because of a row here, not because they share a gym.';


-- ── exercise library ────────────────────────────────────────────────────────

create table exercises (
  id              uuid primary key default gen_random_uuid(),
  gym_id          uuid not null references gyms(id) on delete cascade,
  name            text not null,
  primary_muscle  text not null,
  secondary_muscles text[] not null default '{}',
  equipment       text not null,
  difficulty      text not null default 'intermediate'
                    check (difficulty in ('beginner', 'intermediate', 'advanced')),
  instructions    text,
  common_mistakes text,
  video_url       text,
  -- Seeded library entries vs ones a trainer added. Both are per-gym, so a
  -- gym can rename "Bench press" to whatever their trainers actually say.
  is_custom       boolean not null default false,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  unique (gym_id, name)
);

create index exercises_gym_muscle_idx on exercises (gym_id, primary_muscle)
  where is_active;


-- ── plans ───────────────────────────────────────────────────────────────────

create table workout_plans (
  id          uuid primary key default gen_random_uuid(),
  gym_id      uuid not null references gyms(id) on delete cascade,
  name        text not null,
  goal        text,
  days_per_week smallint not null default 3
                  check (days_per_week between 1 and 7),
  created_by  uuid references profiles(id) on delete set null,
  -- A template is a starting point; assigning it copies nothing, the
  -- assignment points at it. Editing a template therefore changes future
  -- sessions but never a session already logged, because sessions snapshot.
  is_template boolean not null default false,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index workout_plans_gym_idx on workout_plans (gym_id) where is_active;

create table workout_days (
  id        uuid primary key default gen_random_uuid(),
  gym_id    uuid not null references gyms(id) on delete cascade,
  plan_id   uuid not null references workout_plans(id) on delete cascade,
  day_index smallint not null check (day_index between 1 and 7),
  name      text not null,                    -- 'Chest + Triceps'
  unique (plan_id, day_index)
);

create index workout_days_gym_idx on workout_days (gym_id, plan_id);

create table workout_exercises (
  id           uuid primary key default gen_random_uuid(),
  gym_id       uuid not null references gyms(id) on delete cascade,
  day_id       uuid not null references workout_days(id) on delete cascade,
  exercise_id  uuid not null references exercises(id) on delete restrict,
  position     smallint not null,
  sets         smallint not null default 3 check (sets between 1 and 20),
  target_reps  smallint not null default 10 check (target_reps between 1 and 100),
  target_weight_kg numeric(6,2),
  rest_seconds smallint not null default 90,
  notes        text,
  unique (day_id, position)
);

create index workout_exercises_gym_idx on workout_exercises (gym_id, day_id);


-- ── assignment ──────────────────────────────────────────────────────────────

create table workout_assignments (
  id          uuid primary key default gen_random_uuid(),
  gym_id      uuid not null references gyms(id) on delete cascade,
  member_id   uuid not null references members(id) on delete cascade,
  plan_id     uuid not null references workout_plans(id) on delete cascade,
  assigned_by uuid references profiles(id) on delete set null,
  starts_on   date not null default current_date,
  ends_on     date,
  note        text,
  created_at  timestamptz not null default now()
);

create index workout_assignments_member_idx
  on workout_assignments (gym_id, member_id) where ends_on is null;

-- One live plan per member: "today's workout" has to be unambiguous.
create unique index workout_assignments_one_live
  on workout_assignments (member_id) where ends_on is null;


-- ── sessions and sets ───────────────────────────────────────────────────────

create table workout_sessions (
  id            uuid primary key default gen_random_uuid(),
  gym_id        uuid not null references gyms(id) on delete cascade,
  member_id     uuid not null references members(id) on delete cascade,
  day_id        uuid references workout_days(id) on delete set null,

  -- Snapshot: the plan can be edited or deleted afterwards, and a logged
  -- session must still read correctly a year later.
  day_name      text not null,
  plan_name     text,

  started_at    timestamptz not null default now(),
  completed_at  timestamptz,
  -- 1-5, the "how did it feel" on M-16. Drives progression suggestions.
  feel_rating   smallint check (feel_rating between 1 and 5),
  member_note   text,
  trainer_note  text,
  created_at    timestamptz not null default now()
);

create index workout_sessions_member_idx
  on workout_sessions (gym_id, member_id, started_at desc);
create index workout_sessions_open_idx
  on workout_sessions (gym_id, member_id) where completed_at is null;

create table set_logs (
  id           uuid primary key default gen_random_uuid(),
  gym_id       uuid not null references gyms(id) on delete cascade,
  session_id   uuid not null references workout_sessions(id) on delete cascade,
  exercise_id  uuid not null references exercises(id) on delete restrict,

  set_number   smallint not null check (set_number between 1 and 20),
  -- What the plan asked for, captured at log time.
  target_reps  smallint,
  target_weight_kg numeric(6,2),
  -- What actually happened.
  reps         smallint not null check (reps >= 0),
  weight_kg    numeric(6,2) not null check (weight_kg >= 0),

  logged_at    timestamptz not null default now(),
  unique (session_id, exercise_id, set_number)
);

create index set_logs_session_idx  on set_logs (gym_id, session_id);
create index set_logs_exercise_idx on set_logs (gym_id, exercise_id, logged_at desc);


-- ── body measurements ───────────────────────────────────────────────────────

create table measurements (
  id            uuid primary key default gen_random_uuid(),
  gym_id        uuid not null references gyms(id) on delete cascade,
  member_id     uuid not null references members(id) on delete cascade,
  taken_on      date not null default current_date,
  weight_kg     numeric(5,2),
  body_fat_pct  numeric(4,1),
  chest_cm      numeric(5,1),
  waist_cm      numeric(5,1),
  hip_cm        numeric(5,1),
  biceps_cm     numeric(5,1),
  thigh_cm      numeric(5,1),
  note          text,
  recorded_by   uuid references profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  -- One entry per member per day: a second weigh-in the same afternoon is a
  -- correction, not a new data point on the chart.
  unique (member_id, taken_on)
);

create index measurements_member_idx on measurements (gym_id, member_id, taken_on desc);


-- ── the coaching functions ──────────────────────────────────────────────────

/*
  What this member should train today, with last time's numbers alongside
  each prescribed set.

  "Previous 60x10 -> suggested 62.5" on M-13 is the single most useful thing
  on the set logger, and it has to come from the database: the member's phone
  cannot be trusted to know what they lifted last week, and computing it
  client-side means shipping their whole history.
*/
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
  -- Rotate through the plan's days by how many sessions are already logged,
  -- so the member always gets the next day in the split rather than Day 1
  -- forever.
  done as (
    select count(*)::int as n
      from public.workout_sessions s
     where s.gym_id = p_gym_id and s.member_id = p_member_id
       and s.completed_at is not null
  ),
  day_count as (
    select count(*)::int as n from public.workout_days wd, live
     where wd.plan_id = live.plan_id
  ),
  today as (
    select wd.*
      from public.workout_days wd, live, done, day_count
     where wd.plan_id = live.plan_id
       and day_count.n > 0
       and wd.day_index = (done.n % day_count.n) + 1
     limit 1
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
        'exercises', coalesce((select rows from items), '[]'::jsonb),
        'open_session_id', (
          select s.id from public.workout_sessions s
           where s.gym_id = p_gym_id and s.member_id = p_member_id
             and s.completed_at is null
           order by s.started_at desc limit 1)
      )
  end;
$$;


/* Starts a session, or returns the one already open. Re-opening the app
   mid-workout must not lose the sets already logged. */
create or replace function start_workout_session(
  p_gym_id uuid, p_member_id uuid, p_day_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id   uuid;
  v_day  public.workout_days%rowtype;
  v_plan text;
begin
  select s.id into v_id
    from public.workout_sessions s
   where s.gym_id = p_gym_id and s.member_id = p_member_id
     and s.completed_at is null
   order by s.started_at desc limit 1;
  if found then return v_id; end if;

  select * into v_day from public.workout_days wd where wd.id = p_day_id;
  select wp.name into v_plan from public.workout_plans wp where wp.id = v_day.plan_id;

  insert into public.workout_sessions (gym_id, member_id, day_id, day_name, plan_name)
  values (p_gym_id, p_member_id, p_day_id,
          coalesce(v_day.name, 'Workout'), v_plan)
  returning id into v_id;

  return v_id;
end;
$$;


/* Upsert one set. The member edits a weight, taps the tick, changes their
   mind and taps again — each is the same set, not three. */
create or replace function log_set(
  p_gym_id uuid, p_session_id uuid, p_exercise_id uuid,
  p_set_number smallint, p_reps smallint, p_weight_kg numeric,
  p_target_reps smallint default null, p_target_weight_kg numeric default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_id uuid; v_gym uuid;
begin
  select s.gym_id into v_gym
    from public.workout_sessions s where s.id = p_session_id;
  if v_gym is null or v_gym <> p_gym_id then
    raise exception 'log_set: session % is not in gym %', p_session_id, p_gym_id;
  end if;

  insert into public.set_logs
    (gym_id, session_id, exercise_id, set_number, reps, weight_kg,
     target_reps, target_weight_kg)
  values
    (p_gym_id, p_session_id, p_exercise_id, p_set_number, p_reps, p_weight_kg,
     p_target_reps, p_target_weight_kg)
  on conflict (session_id, exercise_id, set_number) do update
    set reps = excluded.reps,
        weight_kg = excluded.weight_kg,
        logged_at = now()
  returning id into v_id;

  return v_id;
end;
$$;


/* Finish, and return the summary M-16 shows. */
create or replace function finish_workout_session(
  p_gym_id uuid, p_session_id uuid,
  p_feel smallint default null, p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_out jsonb;
begin
  update public.workout_sessions
     set completed_at = now(), feel_rating = p_feel, member_note = p_note
   where id = p_session_id and gym_id = p_gym_id and completed_at is null;

  select jsonb_build_object(
    'day_name',   s.day_name,
    'minutes',    greatest(1, round(extract(epoch from (s.completed_at - s.started_at)) / 60))::int,
    'sets',       (select count(*) from public.set_logs sl where sl.session_id = s.id),
    'volume_kg',  coalesce((select round(sum(sl.reps * sl.weight_kg))
                              from public.set_logs sl where sl.session_id = s.id), 0),
    -- A personal best is a heavier top set than any earlier session for that
    -- exercise. Computed here so the member sees it the moment it happens.
    'prs', coalesce((
      select jsonb_agg(distinct jsonb_build_object('exercise', e.name, 'weight_kg', sl.weight_kg))
        from public.set_logs sl
        join public.exercises e on e.id = sl.exercise_id
       where sl.session_id = s.id
         and sl.weight_kg > coalesce((
               select max(prev.weight_kg)
                 from public.set_logs prev
                 join public.workout_sessions ps on ps.id = prev.session_id
                where prev.exercise_id = sl.exercise_id
                  and ps.member_id = s.member_id
                  and ps.id <> s.id), 0)
    ), '[]'::jsonb)
  ) into v_out
  from public.workout_sessions s where s.id = p_session_id;

  return v_out;
end;
$$;


/*
  Deterministic progression, per the plan's Phase-1 rule: if every prescribed
  rep was hit at the prescribed weight, go up — 2.5 kg upper body, 5 kg lower.
  Miss twice running and hold.

  Explicitly NOT AI. The brief puts AI in Phase 5, and a rule a trainer can
  predict is one they will trust; a suggestion they cannot explain to a
  member is one they will override every time.
*/
create or replace function suggest_next_weight(
  p_gym_id uuid, p_member_id uuid, p_exercise_id uuid
)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with recent as (
    select ws.id as session_id, ws.started_at,
           max(sl.weight_kg) as top_weight,
           bool_and(sl.reps >= coalesce(sl.target_reps, sl.reps)) as hit_all
      from public.set_logs sl
      join public.workout_sessions ws on ws.id = sl.session_id
     where sl.gym_id = p_gym_id
       and sl.exercise_id = p_exercise_id
       and ws.member_id = p_member_id
       and ws.completed_at is not null
     group by ws.id, ws.started_at
     order by ws.started_at desc
     limit 2
  ),
  lower_body as (
    select e.primary_muscle in ('Legs', 'Glutes', 'Back') as is_lower
      from public.exercises e where e.id = p_exercise_id
  )
  select case
    when not exists (select 1 from recent) then
      jsonb_build_object('suggestion', null, 'reason', 'no history')
    when (select hit_all from recent order by started_at desc limit 1) then
      jsonb_build_object(
        'suggestion',
        (select top_weight from recent order by started_at desc limit 1)
          + case when (select is_lower from lower_body) then 5 else 2.5 end,
        'reason', 'hit every rep last time')
    when (select count(*) from recent where not hit_all) >= 2 then
      jsonb_build_object(
        'suggestion', (select top_weight from recent order by started_at desc limit 1),
        'reason', 'hold — missed reps twice')
    else
      jsonb_build_object(
        'suggestion', (select top_weight from recent order by started_at desc limit 1),
        'reason', 'repeat last weight')
  end;
$$;


-- ── RLS ─────────────────────────────────────────────────────────────────────

select private.apply_tenant_rls('trainer_clients',     'staff');
select private.apply_tenant_rls('exercises',           'exercises');
select private.apply_tenant_rls('workout_plans',       'workouts');
select private.apply_tenant_rls('workout_days',        'workouts');
select private.apply_tenant_rls('workout_exercises',   'workouts');
select private.apply_tenant_rls('workout_assignments', 'workouts');
select private.apply_tenant_rls('workout_sessions',    'workouts');
select private.apply_tenant_rls('set_logs',            'workouts');
select private.apply_tenant_rls('measurements',        'progress');

/* A member's own training data. Without these the generated policies (which
   require scope 'all') would return nothing to the person the data is about —
   the same gap that made the member app show "No active membership". */

create policy workout_assignments_self on workout_assignments for select to authenticated
  using (gym_id = (select auth_gym_id())
     and exists (select 1 from members m where m.id = workout_assignments.member_id
                   and m.user_id = (select auth.uid())));

create policy workout_sessions_self on workout_sessions for all to authenticated
  using (gym_id = (select auth_gym_id())
     and exists (select 1 from members m where m.id = workout_sessions.member_id
                   and m.user_id = (select auth.uid())))
  with check (gym_id = (select auth_gym_id())
     and exists (select 1 from members m where m.id = workout_sessions.member_id
                   and m.user_id = (select auth.uid())));

create policy set_logs_self on set_logs for all to authenticated
  using (gym_id = (select auth_gym_id())
     and exists (select 1 from workout_sessions ws join members m on m.id = ws.member_id
                  where ws.id = set_logs.session_id and m.user_id = (select auth.uid())))
  with check (gym_id = (select auth_gym_id())
     and exists (select 1 from workout_sessions ws join members m on m.id = ws.member_id
                  where ws.id = set_logs.session_id and m.user_id = (select auth.uid())));

create policy measurements_self on measurements for all to authenticated
  using (gym_id = (select auth_gym_id())
     and exists (select 1 from members m where m.id = measurements.member_id
                   and m.user_id = (select auth.uid())))
  with check (gym_id = (select auth_gym_id())
     and exists (select 1 from members m where m.id = measurements.member_id
                   and m.user_id = (select auth.uid())));

-- The plan a member is following, and the exercises in it, must be readable
-- by them or the workout screen is empty.
create policy workout_plans_assigned on workout_plans for select to authenticated
  using (gym_id = (select auth_gym_id())
     and exists (select 1 from workout_assignments wa join members m on m.id = wa.member_id
                  where wa.plan_id = workout_plans.id and m.user_id = (select auth.uid())));

create policy workout_days_assigned on workout_days for select to authenticated
  using (gym_id = (select auth_gym_id())
     and exists (select 1 from workout_assignments wa join members m on m.id = wa.member_id
                  where wa.plan_id = workout_days.plan_id and m.user_id = (select auth.uid())));

create policy workout_exercises_assigned on workout_exercises for select to authenticated
  using (gym_id = (select auth_gym_id())
     and exists (select 1 from workout_days wd
                   join workout_assignments wa on wa.plan_id = wd.plan_id
                   join members m on m.id = wa.member_id
                  where wd.id = workout_exercises.day_id
                    and m.user_id = (select auth.uid())));

/* Trainers work through scope 'assigned', which the generated policies do not
   grant. These give them exactly their own clients and nothing else. */

create policy members_trainer_assigned on members for select to authenticated
  using (gym_id = (select auth_gym_id())
     and (select permission_scope('members')) = 'assigned'
     and exists (select 1 from trainer_clients tc
                  where tc.member_id = members.id
                    and tc.trainer_id = (select auth.uid())
                    and tc.ended_on is null));

create policy trainer_clients_own on trainer_clients for select to authenticated
  using (gym_id = (select auth_gym_id()) and trainer_id = (select auth.uid()));

create policy workout_sessions_trainer on workout_sessions for select to authenticated
  using (gym_id = (select auth_gym_id())
     and exists (select 1 from trainer_clients tc
                  where tc.member_id = workout_sessions.member_id
                    and tc.trainer_id = (select auth.uid())
                    and tc.ended_on is null));

create policy set_logs_trainer on set_logs for select to authenticated
  using (gym_id = (select auth_gym_id())
     and exists (select 1 from workout_sessions ws
                   join trainer_clients tc on tc.member_id = ws.member_id
                  where ws.id = set_logs.session_id
                    and tc.trainer_id = (select auth.uid())
                    and tc.ended_on is null));

create policy measurements_trainer on measurements for all to authenticated
  using (gym_id = (select auth_gym_id())
     and exists (select 1 from trainer_clients tc
                  where tc.member_id = measurements.member_id
                    and tc.trainer_id = (select auth.uid())
                    and tc.ended_on is null))
  with check (gym_id = (select auth_gym_id()));

create trigger workout_plans_touch before update on workout_plans
  for each row execute function private.touch_updated_at();

revoke execute on function start_workout_session(uuid, uuid, uuid) from public, anon;
revoke execute on function log_set(uuid, uuid, uuid, smallint, smallint, numeric, smallint, numeric)
  from public, anon;
revoke execute on function finish_workout_session(uuid, uuid, smallint, text) from public, anon;
grant execute on function start_workout_session(uuid, uuid, uuid) to authenticated, service_role;
grant execute on function log_set(uuid, uuid, uuid, smallint, smallint, numeric, smallint, numeric)
  to authenticated, service_role;
grant execute on function finish_workout_session(uuid, uuid, smallint, text)
  to authenticated, service_role;
