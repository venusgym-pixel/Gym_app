-- Let a gym name a kind of kit the list does not have.
--
-- category was a CHECK over six words, which is a reasonable starting
-- vocabulary and a poor cage: a gym with a sled, a turf lane, a pool or a
-- boxing ring had nowhere to put them and had to file them as "accessory".
--
-- The constraint goes rather than gaining a seventh word, because the next
-- gym will want an eighth. What it was really enforcing was tidiness of a
-- free-text label, and the form still offers the six as the obvious choices —
-- it just no longer refuses anything else.
--
-- Not-null and non-empty stay: an unlabelled category is a bug, an unusual
-- one is a gym.
alter table equipment drop constraint if exists equipment_category_check;

alter table equipment
  add constraint equipment_category_present
    check (length(btrim(category)) between 2 and 40);

comment on column equipment.category is
  'Free label. The admin form suggests machine / free_weight / cable / '
  'cardio / bench_rack / accessory and accepts anything a gym actually owns.';
