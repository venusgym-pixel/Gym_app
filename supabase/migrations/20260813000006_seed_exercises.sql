-- ============================================================================
-- 0013 · Starter exercise library.
--
-- A trainer who has to type forty exercises before they can build one plan
-- will build zero plans. This seeds the movements a general gym actually
-- programmes, per gym so each can rename or deactivate them.
--
-- Called from seed_gym_exercises(gym_id), which bootstrap runs for new gyms
-- and which is safe to re-run on existing ones.
-- ============================================================================

create or replace function seed_gym_exercises(p_gym_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  n integer := 0;
begin
  for r in
    select * from (values
      -- name, primary, secondary, equipment, difficulty
      ('Barbell bench press',   'Chest',     array['Triceps','Shoulders'], 'Barbell',    'intermediate'),
      ('Incline dumbbell press','Chest',     array['Shoulders'],           'Dumbbell',   'intermediate'),
      ('Cable fly',             'Chest',     array[]::text[],              'Cable',      'beginner'),
      ('Push-up',               'Chest',     array['Triceps','Core'],      'Bodyweight', 'beginner'),

      ('Deadlift',              'Back',      array['Legs','Core'],         'Barbell',    'advanced'),
      ('Barbell row',           'Back',      array['Biceps'],              'Barbell',    'intermediate'),
      ('Lat pulldown',          'Back',      array['Biceps'],              'Machine',    'beginner'),
      ('Seated cable row',      'Back',      array['Biceps'],              'Cable',      'beginner'),
      ('Pull-up',               'Back',      array['Biceps'],              'Bodyweight', 'advanced'),

      ('Overhead press',        'Shoulders', array['Triceps'],             'Barbell',    'intermediate'),
      ('Lateral raise',         'Shoulders', array[]::text[],              'Dumbbell',   'beginner'),
      ('Face pull',             'Shoulders', array['Back'],                'Cable',      'beginner'),

      ('Barbell curl',          'Biceps',    array[]::text[],              'Barbell',    'beginner'),
      ('Hammer curl',           'Biceps',    array[]::text[],              'Dumbbell',   'beginner'),

      ('Triceps rope pushdown', 'Triceps',   array[]::text[],              'Cable',      'beginner'),
      ('Overhead extension',    'Triceps',   array[]::text[],              'Dumbbell',   'beginner'),
      ('Close-grip bench press','Triceps',   array['Chest'],               'Barbell',    'intermediate'),

      ('Back squat',            'Legs',      array['Glutes','Core'],       'Barbell',    'intermediate'),
      ('Front squat',           'Legs',      array['Core'],                'Barbell',    'advanced'),
      ('Leg press',             'Legs',      array['Glutes'],              'Machine',    'beginner'),
      ('Romanian deadlift',     'Legs',      array['Glutes','Back'],       'Barbell',    'intermediate'),
      ('Walking lunge',         'Legs',      array['Glutes'],              'Dumbbell',   'beginner'),
      ('Leg curl',              'Legs',      array[]::text[],              'Machine',    'beginner'),
      ('Calf raise',            'Legs',      array[]::text[],              'Machine',    'beginner'),

      ('Hip thrust',            'Glutes',    array['Legs'],                'Barbell',    'intermediate'),

      ('Plank',                 'Core',      array[]::text[],              'Bodyweight', 'beginner'),
      ('Hanging leg raise',     'Core',      array[]::text[],              'Bodyweight', 'intermediate'),
      ('Cable crunch',          'Core',      array[]::text[],              'Cable',      'beginner'),

      ('Treadmill run',         'Cardio',    array['Legs'],                'Machine',    'beginner'),
      ('Rowing machine',        'Cardio',    array['Back','Legs'],         'Machine',    'beginner')
    ) as t(name, muscle, secondary, equipment, difficulty)
  loop
    insert into public.exercises
      (gym_id, name, primary_muscle, secondary_muscles, equipment, difficulty)
    values
      (p_gym_id, r.name, r.muscle, r.secondary, r.equipment, r.difficulty)
    on conflict (gym_id, name) do nothing;
    if found then n := n + 1; end if;
  end loop;

  return n;
end;
$$;

/*
  A three-day full-body split using only seeded movements, so a gym can
  assign something sensible on day one. Returns the plan id.

  Push / pull / legs because it is the split most Indian commercial gyms
  already run, and a trainer recognising the shape is more likely to keep it
  than replace it.
*/
create or replace function seed_starter_plan(p_gym_id uuid, p_created_by uuid default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan uuid;
  v_day  uuid;
  r      record;
begin
  select id into v_plan from public.workout_plans
   where gym_id = p_gym_id and name = 'Starter 3-day split' limit 1;
  if found then return v_plan; end if;

  insert into public.workout_plans (gym_id, name, goal, days_per_week, created_by, is_template)
  values (p_gym_id, 'Starter 3-day split', 'General strength', 3, p_created_by, true)
  returning id into v_plan;

  for r in
    select * from (values
      (1, 'Push · Chest + Shoulders + Triceps',
       array['Barbell bench press','Incline dumbbell press','Overhead press',
             'Lateral raise','Triceps rope pushdown']),
      (2, 'Pull · Back + Biceps',
       array['Barbell row','Lat pulldown','Seated cable row','Face pull','Barbell curl']),
      (3, 'Legs + Core',
       array['Back squat','Romanian deadlift','Leg press','Walking lunge','Plank'])
    ) as t(idx, day_name, moves)
  loop
    insert into public.workout_days (gym_id, plan_id, day_index, name)
    values (p_gym_id, v_plan, r.idx, r.day_name)
    returning id into v_day;

    insert into public.workout_exercises
      (gym_id, day_id, exercise_id, position, sets, target_reps, rest_seconds)
    select p_gym_id, v_day, e.id, ord::smallint, 3, 10, 90
      from unnest(r.moves) with ordinality as m(name, ord)
      join public.exercises e on e.gym_id = p_gym_id and e.name = m.name;
  end loop;

  return v_plan;
end;
$$;
