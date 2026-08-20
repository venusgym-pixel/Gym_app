-- ============================================================================
-- A split may be longer than a week.
--
-- workout_days.day_index was checked between 1 and 7, and workout_plans
-- .days_per_week likewise, so a trainer could not build anything past seven
-- days. That bakes in an assumption the rest of the system does not make:
-- todays_workout rotates by SESSION, not by weekday, so a plan has never
-- actually been a week. It is a cycle of any length, and a member who trains
-- four times one week and twice the next simply moves through it slower.
--
-- Seven was fine for push/pull/legs. It refuses the things trainers actually
-- write for serious lifters — an upper/lower/push/pull/legs/arms/conditioning
-- rotation, or a twelve-day block that hits each pattern three times at
-- different intensities.
--
-- Thirty is the new ceiling: past that it is a calendar, not a split, and the
-- day picker in the member app would become a phone book.
--
-- days_per_week keeps its name. It is read in exactly one place as a display
-- number and renaming a column that a generated types file and several
-- queries reference is a bigger change than this one, for no behavioural gain.
-- The comment below is what stops the name misleading the next reader.
-- ============================================================================

alter table workout_days
  drop constraint if exists workout_days_day_index_check;

alter table workout_days
  add constraint workout_days_day_index_check
    check (day_index between 1 and 30);

alter table workout_plans
  drop constraint if exists workout_plans_days_per_week_check;

alter table workout_plans
  add constraint workout_plans_days_per_week_check
    check (days_per_week between 1 and 30);

comment on column workout_plans.days_per_week is
  'How many days are in the cycle — NOT how many times a week anyone trains. '
  'The rotation advances per completed session, so a 5-day cycle takes a '
  'fortnight for someone training twice a week. Named for the week only '
  'because it predates plans longer than one.';

comment on column workout_days.day_index is
  'Position in the cycle, 1..30. The next day offered follows the last one '
  'completed, so gaps in attendance never skip a day.';
