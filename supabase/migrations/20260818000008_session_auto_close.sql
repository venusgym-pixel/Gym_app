-- ============================================================================
-- A visit becomes a session that ends 90 minutes after entry.
--
-- There is no punch-out in this product, deliberately: members reliably check
-- in, because it gets them through the door, and reliably forget to check out,
-- because nothing stops them leaving. So the end of a session is not recorded,
-- it is DERIVED.
--
-- Three ways to do that, and the two obvious ones are both worse:
--
--   A stored generated column is the tidiest-looking option and is illegal.
--   Generated expressions must be IMMUTABLE, and timestamptz + interval is
--   only STABLE — adding days or months depends on the session time zone.
--   Postgres rejects it outright with "generation expression is not
--   immutable", verified before writing this.
--
--   A cron sweep writing an end time would be doing arithmetic the database
--   can do for free, on a schedule that can fail silently. This project has
--   already had a cron job fail 205 times in a row unnoticed.
--
-- So: a view. Nothing to run, nothing to backfill, nothing to drift, and it
-- applies to rows already in the table. "Still in the gym" filters on
-- checked_in_at, which is the leading edge of attendance_gym_time_idx, so no
-- new index is needed either.
--
-- 90 minutes is fixed rather than a per-gym setting. One visible number beats
-- a setting nobody will change.
-- ============================================================================

create view attendance_sessions with (security_invoker = true) as
  select
    a.*,
    a.checked_in_at + interval '90 minutes' as ends_at,
    a.checked_in_at + interval '90 minutes' > now() as in_progress
  from attendance a;

/* security_invoker, emphatically. Without it a view runs as its OWNER, which
   would read straight past the RLS on attendance and hand any signed-in user
   every gym's visits — the exact cross-tenant leak the whole schema is built
   to prevent. */

comment on view attendance_sessions is
  'Attendance with a derived session end: always 90 minutes after entry. '
  'The gym has no exit scan, so ends_at is the house rule for how long a '
  'visit lasts, not an observation of when anyone left. Never present it as a '
  'measured workout duration.';

grant select on attendance_sessions to authenticated;
