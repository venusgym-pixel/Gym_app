import { createServerDb, requireActor } from "@/lib/db/server";
import { seesWholeGym } from "@/lib/auth/permissions";
import type { GymRole } from "@/lib/db/database.types";
import { PageHeader } from "@/components/admin/shell";
import { Board, type BoardMember, type LibraryExercise, type PlanDay } from "./client";

/* ============================================================================
   T-12 · Today's board.

   One row per client, and for each one the answer to "what is this person
   doing today". Left alone it says the plan decides. Touched, it says exactly
   what the trainer wrote — which exercises, how many sets, what weight.

   Scoped to the trainer's own clients through trainer_clients, the same join
   the rest of the coaching surface uses. A manager or owner with gym-wide
   workout permission sees whoever their permissions allow, because the RLS
   decides that rather than this query.
   ========================================================================= */

export const dynamic = "force-dynamic";

export default async function BoardPage() {
  const actor = await requireActor();
  const db = await createServerDb();

  /* The gym's date, not the server's. Asked of the database so it matches the
     one todays_workout compares against — computing "today" in Node would put
     the board and the member app on different days for the 5am crowd. */
  const { data: dateRow } = await db.rpc("gym_today", { p_gym_id: actor.gymId });
  const today = String(dateRow);

  /* An owner coaching their own gym is the ordinary case for a single-site
     Indian gym, and they will never appear in trainer_clients — nobody assigns
     the owner to anybody. Scoped roles get their own clients; gym-wide ones
     get the gym, which is what their permissions already say. */
  const wholeGym = seesWholeGym(actor.role as GymRole, "workouts");

  const [{ data: clients }, { data: rx }, { data: library }, { data: days }] =
    await Promise.all([
      wholeGym
        ? db
            .from("members")
            .select("id, full_name, member_code")
            .eq("gym_id", actor.gymId)
            .order("full_name")
            .limit(200)
        : db
            .from("trainer_clients")
            .select("member_id, members(id, full_name, member_code)")
            .eq("gym_id", actor.gymId)
            .eq("trainer_id", actor.userId)
            .is("ended_on", null),

      db
        .from("workout_prescriptions")
        .select(
          "id, member_id, day_id, day_name, plan_name, note, " +
            "prescription_items(exercise_id, position, sets, target_reps, target_weight_kg, rest_seconds, notes)",
        )
        .eq("gym_id", actor.gymId)
        .eq("for_date", today),

      db
        .from("exercises")
        .select("id, name, primary_muscle, equipment")
        .eq("gym_id", actor.gymId)
        .eq("is_active", true)
        .order("primary_muscle")
        .order("name"),

      db
        .from("workout_days")
        .select(
          "id, name, day_index, plan_id, workout_plans(name), " +
            "workout_exercises(exercise_id, position, sets, target_reps, target_weight_kg, rest_seconds)",
        )
        .eq("gym_id", actor.gymId)
        .order("day_index"),
    ]);

  type ClientRow = {
    member_id: string;
    members: { id: string; full_name: string; member_code: string } | null;
  };

  const rxByMember = new Map<string, unknown>();
  for (const r of (rx ?? []) as unknown as { member_id: string }[]) {
    rxByMember.set(r.member_id, r);
  }

  /* The two queries return different shapes — one nests the member, the other
     is the member — so flatten before anything else looks at them. */
  type FlatRow = { id: string; full_name: string; member_code: string };
  const rows: FlatRow[] = wholeGym
    ? ((clients ?? []) as unknown as FlatRow[])
    : ((clients ?? []) as unknown as ClientRow[])
        .filter((c) => c.members)
        .map((c) => c.members!);

  const members: BoardMember[] = rows
    .map((r) => ({
      id: r.id,
      name: r.full_name,
      code: r.member_code,
      prescription: (rxByMember.get(r.id) ?? null) as BoardMember["prescription"],
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <>
      <PageHeader
        eyebrow="Coaching"
        title="Today's board"
        sub={
          `${new Date(today).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}` +
          " · anyone you do not set falls back to their plan."
        }
      />
      <Board
        members={members}
        today={today}
        library={(library ?? []) as unknown as LibraryExercise[]}
        days={(days ?? []) as unknown as PlanDay[]}
      />
    </>
  );
}
