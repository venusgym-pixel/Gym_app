/* ============================================================================
   How long a visit lasts.

   Mirrors the attendance_sessions view in
   supabase/migrations/20260818000008_session_auto_close.sql. Two copies of one
   number is not ideal, and it is deliberate: the view is what SQL reporting
   reads, while the admin screens embed members(...) through PostgREST against
   the base table, and moving those queries onto the view would change how that
   embedding resolves. Keeping the number named in both places, pointing at each
   other, beats a query I cannot test.

   The gym has no exit scan. Nothing observes when anyone leaves, so a session
   does not END, it EXPIRES — 90 minutes after entry, always. That is a house
   rule, not a measurement, which is why nothing here is named "duration": the
   moment a figure like that appears in a report someone will average it and
   believe the answer.
   ========================================================================= */

export const SESSION_MINUTES = 90;

const SESSION_MS = SESSION_MINUTES * 60 * 1000;

/** When a visit that started at `checkedInAt` is considered over. */
export function sessionEndsAt(checkedInAt: string | Date): Date {
  return new Date(new Date(checkedInAt).getTime() + SESSION_MS);
}

/** Whether that visit is still counted as being in the gym, as of `now`. */
export function inProgress(checkedInAt: string | Date, now: Date = new Date()): boolean {
  return sessionEndsAt(checkedInAt).getTime() > now.getTime();
}
