"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createServerDb, requireActor } from "@/lib/db/server";
import { can } from "@/lib/auth/permissions";
import type { GymRole } from "@/lib/db/database.types";
import type { ActionResult } from "./members";

/* ============================================================================
   Writing today's session for one member.

   The trainer picks a day to base it on, then edits it line by line: which
   exercise, how many sets, how many reps, what weight. What comes back is an
   override for that member on that date only.

   Deleting it is a first-class action, not an omission. "I changed my mind,
   let the plan handle it" has to be one tap, or trainers end up leaving stale
   prescriptions behind that quietly outrank the programme.
   ========================================================================= */

const Item = z.object({
  exercise_id: z.uuid(),
  sets: z.coerce.number().int().min(1).max(20),
  target_reps: z.coerce.number().int().min(1).max(100),
  /* Empty means bodyweight or "whatever you managed last time" — a real
     answer, and different from zero.

     preprocess rather than a union with z.literal(""): zod tries union arms in
     order and z.coerce.number() turns "" into 0, which passes min(0), so the
     literal arm was dead code and every blank weight was being stored as 0kg.
     The member then reads "0 kg" where the coach meant bodyweight. */
  target_weight_kg: z.preprocess(
    (v) => (v === "" || v === null ? undefined : v),
    z.coerce.number().min(0).max(1000).optional(),
  ),
  /* Same trap: a cleared rest field coerced to 0, prescribing no rest at all
     between sets. Blank must fall through to the default. */
  rest_seconds: z.preprocess(
    (v) => (v === "" || v === null ? undefined : v),
    z.coerce.number().int().min(0).max(600).default(90),
  ),
  notes: z.string().trim().max(200).optional(),
});

const Save = z.object({
  member_id: z.uuid(),
  for_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  day_id: z.union([z.uuid(), z.literal("")]).optional(),
  day_name: z.string().trim().min(1).max(60),
  plan_name: z.string().trim().max(80).optional(),
  note: z.string().trim().max(300).optional(),
  items: z.array(Item).min(1).max(30),
});

/** Trainers and anyone who can edit workouts gym-wide. */
type Gate =
  | { actor: Awaited<ReturnType<typeof requireActor>>; error?: undefined }
  | { actor?: undefined; error: ActionResult };

async function gate(): Promise<Gate> {
  const actor = await requireActor();
  if (!can(actor.role as GymRole, "workouts", "edit")) {
    return { error: { ok: false, error: "You cannot write workouts." } };
  }
  return { actor };
}

export async function savePrescription(payload: unknown): Promise<ActionResult> {
  const g = await gate();
  if (g.error) return g.error;
  const actor = g.actor;

  const parsed = Save.safeParse(payload);
  if (!parsed.success) {
    return { ok: false, error: "Check the exercises — each needs sets and reps." };
  }
  const v = parsed.data;

  const db = await createServerDb();

  /* Upsert on (gym, member, date): saving twice is editing, never a second
     rival set of instructions for the same morning. */
  const { data: head, error: headErr } = await db
    .from("workout_prescriptions")
    .upsert(
      {
        gym_id: actor.gymId,
        member_id: v.member_id,
        for_date: v.for_date,
        day_id: v.day_id || null,
        day_name: v.day_name,
        plan_name: v.plan_name || null,
        assigned_by: actor.userId,
        note: v.note || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "gym_id,member_id,for_date" },
    )
    .select("id")
    .maybeSingle();

  if (headErr || !head) {
    return {
      ok: false,
      error: headErr?.code === "42501"
        ? "That member is not one of your clients."
        : "Could not save the session.",
    };
  }

  const rxId = (head as { id: string }).id;

  /* Replace the lines wholesale rather than diffing. Positions are contiguous
     and unique per prescription, so an in-place edit that reorders anything
     collides with itself halfway through. */
  const { error: delErr } = await db
    .from("prescription_items")
    .delete()
    .eq("prescription_id", rxId);
  if (delErr) return { ok: false, error: "Could not update the exercises." };

  const rows = v.items.map((it, i) => ({
    gym_id: actor.gymId,
    prescription_id: rxId,
    exercise_id: it.exercise_id,
    position: i + 1,
    sets: it.sets,
    target_reps: it.target_reps,
    target_weight_kg: it.target_weight_kg ?? null,
    rest_seconds: it.rest_seconds,
    notes: it.notes || null,
  }));

  const { error: insErr } = await db.from("prescription_items").insert(rows);
  if (insErr) return { ok: false, error: "Could not save the exercises." };

  revalidatePath("/trainer/board");
  revalidatePath("/m/workout");
  return { ok: true, message: `${v.day_name} set for that member.` };
}

/** Hand the member back to the plan rotation. */
export async function clearPrescription(
  memberId: string,
  forDate: string,
): Promise<ActionResult> {
  const g = await gate();
  if (g.error) return g.error;
  const actor = g.actor;

  const db = await createServerDb();
  const { error } = await db
    .from("workout_prescriptions")
    .delete()
    .eq("gym_id", actor.gymId)
    .eq("member_id", memberId)
    .eq("for_date", forDate);

  if (error) return { ok: false, error: "Could not clear it." };

  revalidatePath("/trainer/board");
  revalidatePath("/m/workout");
  return { ok: true, message: "Cleared — the plan decides again." };
}
