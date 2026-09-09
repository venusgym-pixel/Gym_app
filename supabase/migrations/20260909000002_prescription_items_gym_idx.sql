-- The gym_id index prescription_items never got.
--
-- Every policy on this table filters on gym_id, and without a leading index on
-- it each of those filters is a sequential scan. Harmless at one gym with a
-- week of prescriptions; not harmless once a year of daily plans for a few
-- hundred members is in there, which is the point at which nobody is looking.
--
-- The tenant-isolation suite asserts this invariant for every table; this row
-- was the one exception, so the guard was failing rather than guarding.

create index if not exists prescription_items_gym_idx
  on prescription_items (gym_id, prescription_id);
