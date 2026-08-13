-- ============================================================================
-- 0017 · Let a trainer actually use the workout tables.
--
-- Same failure as 0014, one layer deeper. The matrix gives trainers
-- workouts: vced with scope 'assigned', and the generated policies require
-- scope 'all' — so a trainer read zero rows from workout_plans and could not
-- insert a workout_assignment. The symptoms:
--
--   · /trainer/plans reported "0 Plans" against a seeded 3-day split
--   · assignPlan() failed silently — the insert matched no policy
--
-- The split below follows what each table actually is:
--
--   Plan structure (workout_plans, workout_days, workout_exercises) is a
--   gym-wide LIBRARY, not member data. A trainer must browse every plan to
--   pick one, and writing plans is their job, so they get full access
--   gym-wide. Nothing here identifies a member.
--
--   Assignments are member data, so they stay narrowed to the trainer's own
--   clients — reading, creating and ending, but only for people linked to
--   them by trainer_clients.
--
-- Sessions and set_logs already have trainer read policies from 0012; they
-- are the member's own log and a trainer has no business writing them.
-- ============================================================================

-- ── the plan library ────────────────────────────────────────────────────────

create policy workout_plans_trainer on workout_plans for select to authenticated
  using (
    gym_id = (select auth_gym_id())
    and (select permission_scope('workouts')) = 'assigned'
  );

create policy workout_plans_trainer_write on workout_plans for insert to authenticated
  with check (
    gym_id = (select auth_gym_id())
    and (select has_permission('workouts', 'create'))
    and (select permission_scope('workouts')) = 'assigned'
  );

create policy workout_plans_trainer_edit on workout_plans for update to authenticated
  using (
    gym_id = (select auth_gym_id())
    and (select has_permission('workouts', 'edit'))
    and (select permission_scope('workouts')) = 'assigned'
  )
  with check (gym_id = (select auth_gym_id()));

create policy workout_days_trainer on workout_days for select to authenticated
  using (
    gym_id = (select auth_gym_id())
    and (select permission_scope('workouts')) = 'assigned'
  );

create policy workout_days_trainer_write on workout_days for insert to authenticated
  with check (
    gym_id = (select auth_gym_id())
    and (select has_permission('workouts', 'create'))
    and (select permission_scope('workouts')) = 'assigned'
  );

create policy workout_days_trainer_edit on workout_days for update to authenticated
  using (
    gym_id = (select auth_gym_id())
    and (select has_permission('workouts', 'edit'))
    and (select permission_scope('workouts')) = 'assigned'
  )
  with check (gym_id = (select auth_gym_id()));

create policy workout_exercises_trainer on workout_exercises for select to authenticated
  using (
    gym_id = (select auth_gym_id())
    and (select permission_scope('workouts')) = 'assigned'
  );

create policy workout_exercises_trainer_write on workout_exercises for insert to authenticated
  with check (
    gym_id = (select auth_gym_id())
    and (select has_permission('workouts', 'create'))
    and (select permission_scope('workouts')) = 'assigned'
  );

create policy workout_exercises_trainer_edit on workout_exercises for update to authenticated
  using (
    gym_id = (select auth_gym_id())
    and (select has_permission('workouts', 'edit'))
    and (select permission_scope('workouts')) = 'assigned'
  )
  with check (gym_id = (select auth_gym_id()));


-- ── assignments: the trainer's own clients only ─────────────────────────────

create policy workout_assignments_trainer on workout_assignments
  for select to authenticated
  using (
    gym_id = (select auth_gym_id())
    and exists (
      select 1 from trainer_clients tc
      where tc.member_id = workout_assignments.member_id
        and tc.trainer_id = (select auth.uid())
        and tc.ended_on is null
    )
  );

create policy workout_assignments_trainer_write on workout_assignments
  for insert to authenticated
  with check (
    gym_id = (select auth_gym_id())
    and (select has_permission('workouts', 'create'))
    and exists (
      select 1 from trainer_clients tc
      where tc.member_id = workout_assignments.member_id
        and tc.trainer_id = (select auth.uid())
        and tc.ended_on is null
    )
  );

-- Ending an assignment is an update, and assignPlan() does exactly that
-- before inserting the replacement — without this the "one live plan"
-- constraint fires instead.
create policy workout_assignments_trainer_edit on workout_assignments
  for update to authenticated
  using (
    gym_id = (select auth_gym_id())
    and (select has_permission('workouts', 'edit'))
    and exists (
      select 1 from trainer_clients tc
      where tc.member_id = workout_assignments.member_id
        and tc.trainer_id = (select auth.uid())
        and tc.ended_on is null
    )
  )
  with check (gym_id = (select auth_gym_id()));
