import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createServerDb, currentActor } from "@/lib/db/server";

/* ============================================================================
   POST /api/workout — the set logger's write path.

   A Route Handler, not a Server Action, because per ADR-2 everything the
   member surface calls has to survive being wrapped in Expo later. This is
   the highest-frequency write in the product: a member taps the tick once per
   set, thirty times a session, often on gym wifi that barely works.

   Every action is idempotent. log_set upserts on (session, exercise, set), and
   start resumes an open session rather than creating a second one — so a
   retry after a dropped connection can never double-count a set.
   ========================================================================= */

export const dynamic = "force-dynamic";

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("start"), dayId: z.uuid() }),
  z.object({
    action: z.literal("log"),
    sessionId: z.uuid(),
    exerciseId: z.uuid(),
    setNumber: z.number().int().min(1).max(20),
    reps: z.number().int().min(0).max(200),
    weightKg: z.number().min(0).max(1000),
    targetReps: z.number().int().min(1).max(200).nullable().optional(),
  }),
  z.object({
    action: z.literal("finish"),
    sessionId: z.uuid(),
    feel: z.number().int().min(1).max(5).nullable().optional(),
    note: z.string().max(500).nullable().optional(),
  }),
]);

export async function POST(request: NextRequest) {
  const actor = await currentActor();
  if (!actor) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "bad-request" }, { status: 400 });
  }
  const body = parsed.data;

  const db = await createServerDb();

  /* Resolve the member from the SESSION, never from the request. A member id
     in the body would let anyone log sets against anyone. */
  const { data: member } = await db
    .from("members")
    .select("id")
    .eq("gym_id", actor.gymId)
    .eq("user_id", actor.userId)
    .maybeSingle();

  if (!member) return NextResponse.json({ error: "not-a-member" }, { status: 403 });
  const memberId = (member as { id: string }).id;

  if (body.action === "start") {
    const { data, error } = await db.rpc("start_workout_session", {
      p_gym_id: actor.gymId,
      p_member_id: memberId,
      p_day_id: body.dayId,
    });
    if (error) return NextResponse.json({ error: "could-not-start" }, { status: 500 });
    return NextResponse.json({ sessionId: data });
  }

  if (body.action === "log") {
    const { data, error } = await db.rpc("log_set", {
      p_gym_id: actor.gymId,
      p_session_id: body.sessionId,
      p_exercise_id: body.exerciseId,
      p_set_number: body.setNumber,
      p_reps: body.reps,
      p_weight_kg: body.weightKg,
      p_target_reps: body.targetReps ?? null,
    });
    /* RLS owns the real check: set_logs_self only permits writes into a
       session belonging to this member, so a forged sessionId fails here. */
    if (error) return NextResponse.json({ error: "could-not-log" }, { status: 403 });
    return NextResponse.json({ setId: data });
  }

  const { data, error } = await db.rpc("finish_workout_session", {
    p_gym_id: actor.gymId,
    p_session_id: body.sessionId,
    p_feel: body.feel ?? null,
    p_note: body.note ?? null,
  });
  if (error) return NextResponse.json({ error: "could-not-finish" }, { status: 500 });
  return NextResponse.json({ summary: data });
}
