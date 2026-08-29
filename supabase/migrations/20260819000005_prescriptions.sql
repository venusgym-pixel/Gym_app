-- ============================================================================
-- What the trainer prescribed for one member, on one day.
--
-- Until now a plan's day held one set of targets shared by everyone assigned
-- to it: same exercises, same sets, same weight, for a first-timer and for
-- someone two years in. A coach cannot work that way — the whole job is that
-- Ravi squats 60kg for 5 and Arjun squats 100kg for 3 on the same leg day.
--
-- So this is an OVERRIDE LAYER, not a replacement. The plan rotation still
-- runs and still decides what happens when nobody has said otherwise. A
-- prescription only exists for the member-days a trainer has actually touched,
-- which means the gym keeps working on a day the trainer is off, and a new
-- member with no attention yet still gets a sensible session.
--
-- It also solves the equipment-contention problem from the other direction:
-- ten people on leg day can be given ten different exercise lists by the
-- person who knows which machines the gym owns.
--
-- Dated, not open-ended. A prescription is "today's session for this member",
-- so yesterday's stays on the record as what was actually asked for — which is
-- what makes a training log readable a year later.
-- ============================================================================

create table workout_prescriptions (
  id          uuid primary key default gen_random_uuid(),
  gym_id      uuid not null references gyms(id) on delete cascade,
  member_id   uuid not null references members(id) on delete cascade,

  -- The gym's own date, not UTC's. Indian gyms open at 5am, which is still
  -- yesterday in UTC — a prescription written for Tuesday would go live on
  -- Monday evening and vanish before the early crowd arrived.
  for_date    date not null,

  /* Which day of which plan this is based on. Kept so a session can start
     against it and so the member sees a familiar name, but the ITEMS below
     are the source of truth — a trainer may swap every exercise out. */
  day_id      uuid references workout_days(id) on delete set null,
  day_name    text not null,
  plan_name   text,

  assigned_by uuid references profiles(id) on delete set null,
  note        text,

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  -- One prescription per member per day. Writing a second is editing the
  -- first, never adding a rival set of instructions.
  unique (gym_id, member_id, for_date)
);

create index workout_prescriptions_board_idx
  on workout_prescriptions (gym_id, for_date);

create table prescription_items (
  id              uuid primary key default gen_random_uuid(),
  gym_id          uuid not null references gyms(id) on delete cascade,
  prescription_id uuid not null
                    references workout_prescriptions(id) on delete cascade,
  exercise_id     uuid not null references exercises(id) on delete restrict,

  position        smallint not null,
  sets            smallint not null default 3 check (sets between 1 and 20),
  target_reps     smallint not null default 10 check (target_reps between 1 and 100),
  target_weight_kg numeric(6,2),
  rest_seconds    smallint not null default 90,
  notes           text,

  unique (prescription_id, position)
);

create index prescription_items_rx_idx on prescription_items (prescription_id, position);

comment on table workout_prescriptions is
  'A trainer overriding the plan rotation for one member on one date. Absent '
  'means the rotation decides, which is the normal case.';


-- ── who may see and write these ─────────────────────────────────────────────

select private.apply_tenant_rls('workout_prescriptions', 'workouts');
select private.apply_tenant_rls('prescription_items',    'workouts');

/* Trainers work at scope 'assigned', which the generated policies do not
   grant — they check the module permission and require scope 'all'. These give
   a trainer exactly their own clients, the same shape as the existing
   workout_days_trainer policies. */

create policy prescriptions_trainer on workout_prescriptions for select to authenticated
  using (gym_id = (select auth_gym_id())
     and exists (select 1 from trainer_clients tc
                  where tc.member_id = workout_prescriptions.member_id
                    and tc.trainer_id = (select auth.uid())
                    and tc.ended_on is null));

create policy prescriptions_trainer_write on workout_prescriptions for insert to authenticated
  with check (gym_id = (select auth_gym_id())
     and exists (select 1 from trainer_clients tc
                  where tc.member_id = workout_prescriptions.member_id
                    and tc.trainer_id = (select auth.uid())
                    and tc.ended_on is null));

create policy prescriptions_trainer_edit on workout_prescriptions for update to authenticated
  using (gym_id = (select auth_gym_id())
     and exists (select 1 from trainer_clients tc
                  where tc.member_id = workout_prescriptions.member_id
                    and tc.trainer_id = (select auth.uid())
                    and tc.ended_on is null));

create policy prescriptions_trainer_delete on workout_prescriptions for delete to authenticated
  using (gym_id = (select auth_gym_id())
     and exists (select 1 from trainer_clients tc
                  where tc.member_id = workout_prescriptions.member_id
                    and tc.trainer_id = (select auth.uid())
                    and tc.ended_on is null));

/* The member reads their own. They may not write one — the entire point is
   that a coach decided it. */
create policy prescriptions_own on workout_prescriptions for select to authenticated
  using (gym_id = (select auth_gym_id())
     and exists (select 1 from members m
                  where m.id = workout_prescriptions.member_id
                    and m.user_id = (select auth.uid())));

/* Named with a _trainer_ infix like every other hand-written policy here:
   apply_tenant_rls above already generated prescription_items_select,
   _insert, _update and _delete, and reusing one of those names fails the
   whole migration.

   Items follow their parent in every direction. Written as one exists() over
   the prescription rather than repeating the trainer/member split, so the two
   can never drift apart. */
create policy prescription_items_trainer_read on prescription_items for select to authenticated
  using (gym_id = (select auth_gym_id())
     and exists (
       select 1 from workout_prescriptions r
        where r.id = prescription_items.prescription_id
          and (
            /* The coach who owns the client, or the member themselves. Spelled
               out rather than leaning on the nested select being RLS-filtered:
               that narrows this policy by accident, and one security-definer
               helper or one extra permissive policy on workout_prescriptions
               would silently turn "narrow" into "every member in the gym". */
            exists (select 1 from trainer_clients tc
                     where tc.member_id = r.member_id
                       and tc.trainer_id = (select auth.uid())
                       and tc.ended_on is null)
            or exists (select 1 from members m
                        where m.id = r.member_id
                          and m.user_id = (select auth.uid()))
          )));

create policy prescription_items_trainer_write on prescription_items for insert to authenticated
  with check (gym_id = (select auth_gym_id())
     and exists (select 1 from workout_prescriptions r
                  join trainer_clients tc on tc.member_id = r.member_id
                  where r.id = prescription_items.prescription_id
                    and tc.trainer_id = (select auth.uid())
                    and tc.ended_on is null));

create policy prescription_items_trainer_edit on prescription_items for update to authenticated
  using (gym_id = (select auth_gym_id())
     and exists (select 1 from workout_prescriptions r
                  join trainer_clients tc on tc.member_id = r.member_id
                  where r.id = prescription_items.prescription_id
                    and tc.trainer_id = (select auth.uid())
                    and tc.ended_on is null));

create policy prescription_items_trainer_delete on prescription_items for delete to authenticated
  using (gym_id = (select auth_gym_id())
     and exists (select 1 from workout_prescriptions r
                  join trainer_clients tc on tc.member_id = r.member_id
                  where r.id = prescription_items.prescription_id
                    and tc.trainer_id = (select auth.uid())
                    and tc.ended_on is null));


-- ── the gym's own idea of "today" ───────────────────────────────────────────

create or replace function gym_today(p_gym_id uuid)
returns date
language sql
stable
set search_path = ''
as $$
  select (now() at time zone coalesce(
            (select g.timezone from public.gyms g where g.id = p_gym_id),
            'Asia/Kolkata'))::date;
$$;

comment on function gym_today(uuid) is
  'The date at the gym, not in UTC. A 5am session in India is still yesterday '
  'by UTC, so current_date would hand the early crowd the wrong day.';

grant execute on function gym_today(uuid) to authenticated;


-- ── today's workout, trainer first ──────────────────────────────────────────
--
-- The branch is the whole change: if a trainer has written something for this
-- member today, that is the session. Otherwise everything below behaves
-- exactly as it did — same rotation, same day list, same swap.

create or replace function todays_workout(p_gym_id uuid, p_member_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with rx as (
    select r.* from public.workout_prescriptions r
     where r.gym_id = p_gym_id
       and r.member_id = p_member_id
       and r.for_date = public.gym_today(p_gym_id)
     limit 1
  ),
  rx_items as (
    select jsonb_agg(
             jsonb_build_object(
               'exercise_id', e.id,
               'name',        e.name,
               'muscle',      e.primary_muscle,
               'equipment',   e.equipment,
               'sets',        pi.sets,
               'target_reps', pi.target_reps,
               'target_weight_kg', pi.target_weight_kg,
               'rest_seconds',     pi.rest_seconds,
               'position',    pi.position,
               'notes',       pi.notes,
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
             ) order by pi.position) as rows
      from public.prescription_items pi
      join public.exercises e on e.id = pi.exercise_id
      join rx on rx.id = pi.prescription_id
  ),
  live as (
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
               'notes',       we.notes,
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
    -- A trainer said so. Nothing else is consulted.
    when exists (select 1 from rx) then
      jsonb_build_object(
        'assigned',     true,
        'from_trainer', true,
        'plan_name',    coalesce((select plan_name from rx), 'Set by your trainer'),
        'day_id',       (select day_id from rx),
        'day_name',     (select day_name from rx),
        'day_index',    null,
        'day_count',    null,
        'note',         (select note from rx),
        -- No alternatives offered: the member is not meant to reshuffle a
        -- session someone wrote for them by hand.
        'days',         '[]'::jsonb,
        'exercises',    coalesce((select rows from rx_items), '[]'::jsonb),
        'open_session_id', (
          select s.id from public.workout_sessions s
           where s.gym_id = p_gym_id and s.member_id = p_member_id
             and s.completed_at is null
           order by s.started_at desc limit 1)
      )
    when not exists (select 1 from live) then
      jsonb_build_object('assigned', false)
    else
      jsonb_build_object(
        'assigned',  true,
        'from_trainer', false,
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
