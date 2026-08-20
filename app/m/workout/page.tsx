import { createServerDb, requireActor } from "@/lib/db/server";
import { WorkoutLogger } from "./logger";

/* ============================================================================
   M-12/13/14/16 · Today's workout.

   The whole session is one client component; this only fetches what to show.

   `?day=` is how a member does something other than what the split offered.
   Handled here rather than in the browser so the swap arrives as a normal
   navigation — it gets the loading skeleton, it survives a refresh, and the
   back button undoes it. Nothing is at stake at this point either: the picker
   only exists before a session is started, so there are no logged sets to lose.
   ========================================================================= */

export const dynamic = "force-dynamic";

export default async function WorkoutPage({
  searchParams,
}: {
  searchParams: Promise<{ day?: string }>;
}) {
  const actor = await requireActor();
  const db = await createServerDb();

  const { data: member } = await db
    .from("members")
    .select("id")
    .eq("gym_id", actor.gymId)
    .eq("user_id", actor.userId)
    .maybeSingle();

  const memberId = (member as { id: string } | null)?.id;
  if (!memberId) return <WorkoutLogger today={{ assigned: false }} />;

  const { data } = await db.rpc("todays_workout", {
    p_gym_id: actor.gymId,
    p_member_id: memberId,
  });

  const today = (data ?? { assigned: false }) as Record<string, unknown>;
  const chosenId = (await searchParams).day;

  /* A chosen day replaces the offered one wholesale — same shape, so the
     logger has no second code path and begin() starts the right session
     without knowing a swap happened.

     Ignored while a session is already open: that member is mid-workout, and
     swapping the day under them would leave their logged sets attached to a
     session for a day they are no longer looking at. */
  if (chosenId && today.assigned && !today.open_session_id && chosenId !== today.day_id) {
    const { data: detail } = await db.rpc("workout_day_detail", {
      p_gym_id: actor.gymId,
      p_member_id: memberId,
      p_day_id: chosenId,
    });

    /* Null means the day is not in a plan this member is assigned — the SQL
       checks that rather than trusting the id in the URL. Fall through to the
       offered day rather than erroring. */
    const d = detail as Record<string, unknown> | null;
    if (d?.day_id) {
      today.day_id = d.day_id;
      today.day_name = d.day_name;
      today.day_index = d.day_index;
      today.exercises = d.exercises;
      today.swapped = true;
    }
  }

  return <WorkoutLogger today={today as never} />;
}
