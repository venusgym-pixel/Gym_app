-- ============================================================================
-- 0019 · Equipment, and the policies the plan builder was missing.
--
-- Until now "equipment" was a free-text label on an exercise — enough to
-- filter a library, useless for running a floor. This adds the gym's actual
-- kit as data:
--
--   · an `equipment` table (machines, racks, cardio, free weights) with a
--     working / maintenance / out_of_order status the front desk can flip,
--     so a trainer building a plan can see that the leg press is down
--   · an optional exercises.equipment_id link, so an exercise can point at
--     the specific machine it needs while the old text label keeps working
--   · the trainer DELETE policies 0017 forgot: the matrix grants trainers
--     workouts d/'assigned', but without explicit policies a trainer could
--     build a plan and never remove a day or an exercise from it
--   · seed_gym_equipment(), so a new gym starts from a recognisable list
--     instead of an empty page
-- ============================================================================

-- ── the gym's kit ───────────────────────────────────────────────────────────

create table equipment (
  id           uuid primary key default gen_random_uuid(),
  gym_id       uuid not null references gyms(id) on delete cascade,
  name         text not null,
  category     text not null default 'machine'
                 check (category in
                   ('machine', 'free_weight', 'cable', 'cardio', 'bench_rack', 'accessory')),
  brand        text,
  model        text,
  quantity     smallint not null default 1 check (quantity between 1 and 999),
  -- The one field that changes week to week. 'maintenance' = scheduled and
  -- usable-with-care; 'out_of_order' = do not programme this machine.
  status       text not null default 'working'
                 check (status in ('working', 'maintenance', 'out_of_order')),
  photo_url    text,
  purchased_on date,
  notes        text,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (gym_id, name)
);

create index equipment_gym_idx on equipment (gym_id) where is_active;

comment on table equipment is
  'The machines and kit a gym actually owns. Exercises may reference a row '
  'here via equipment_id; the exercises.equipment text stays as the coarse '
  'vocabulary (Barbell/Dumbbell/...) used for filtering.';

create trigger equipment_touch before update on equipment
  for each row execute function private.touch_updated_at();

-- An exercise can name the machine it needs. Nullable: bodyweight movements
-- and gyms that never fill the inventory keep working untouched.
alter table exercises
  add column equipment_id uuid references equipment(id) on delete set null;


-- ── permissions ─────────────────────────────────────────────────────────────

-- Inventory is floor operations: the owner and manager run it, everyone else
-- reads it (a trainer must see what is broken; reception answers "is the
-- sauna belt fixed yet"). Members and nutritionists have no business here.
insert into role_permissions (role, module, can_view, can_create, can_edit, can_delete, scope) values
  ('owner',        'equipment', true, true,  true,  true,  'all'),
  ('manager',      'equipment', true, true,  true,  true,  'all'),
  ('trainer',      'equipment', true, false, false, false, 'all'),
  ('receptionist', 'equipment', true, false, false, false, 'all');

select private.apply_tenant_rls('equipment', 'equipment');


-- ── the delete policies 0017 forgot ─────────────────────────────────────────

/* Plan structure is a gym-wide library (see 0017's header). Trainers hold
   workouts: vced with scope 'assigned', and the generated policies require
   scope 'all' — so every trainer write needs an explicit policy. 0017 added
   select/insert/update; the builder also removes days and exercises. */

create policy workout_plans_trainer_delete on workout_plans for delete to authenticated
  using (
    gym_id = (select auth_gym_id())
    and (select has_permission('workouts', 'delete'))
    and (select permission_scope('workouts')) = 'assigned'
  );

create policy workout_days_trainer_delete on workout_days for delete to authenticated
  using (
    gym_id = (select auth_gym_id())
    and (select has_permission('workouts', 'delete'))
    and (select permission_scope('workouts')) = 'assigned'
  );

create policy workout_exercises_trainer_delete on workout_exercises for delete to authenticated
  using (
    gym_id = (select auth_gym_id())
    and (select has_permission('workouts', 'delete'))
    and (select permission_scope('workouts')) = 'assigned'
  );


-- ── starter inventory ───────────────────────────────────────────────────────

/* Mirrors seed_gym_exercises: a gym that has to type its whole floor before
   the module is useful will never fill it in. The list is what a mid-size
   Indian commercial gym actually has; renaming and retiring is expected. */
/* SECURITY INVOKER on purpose, unlike the older seeds: the app calls this
   from the admin surface as the signed-in owner, so the equipment insert
   policy (own gym, create permission) is what authorises it. Definer would
   let any authenticated user seed rows into an arbitrary gym. */
create or replace function seed_gym_equipment(p_gym_id uuid)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  r record;
  n integer := 0;
begin
  for r in
    select * from (values
      -- name, category, quantity
      ('Olympic barbell + plates',      'free_weight', 4),
      ('Dumbbell rack (2.5–30 kg)',     'free_weight', 1),
      ('Flat bench',                    'bench_rack',  3),
      ('Adjustable incline bench',      'bench_rack',  2),
      ('Squat rack',                    'bench_rack',  2),
      ('Cable crossover station',       'cable',       1),
      ('Lat pulldown machine',          'machine',     1),
      ('Seated row machine',            'machine',     1),
      ('Leg press machine',             'machine',     1),
      ('Leg curl machine',              'machine',     1),
      ('Calf raise machine',            'machine',     1),
      ('Treadmill',                     'cardio',      3),
      ('Rowing machine',                'cardio',      2),
      ('Pull-up bar',                   'accessory',   2)
    ) as t(name, category, quantity)
  loop
    insert into public.equipment (gym_id, name, category, quantity)
    values (p_gym_id, r.name, r.category, r.quantity)
    on conflict (gym_id, name) do nothing;
    if found then n := n + 1; end if;
  end loop;

  return n;
end;
$$;
