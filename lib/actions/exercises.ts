"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createServerDb, requireActor } from "@/lib/db/server";
import { can } from "@/lib/auth/permissions";
import type { GymRole } from "@/lib/db/database.types";
import type { ActionResult } from "./members";
import { EQUIPMENT_KINDS, MUSCLES } from "@/lib/exercise-vocab";

/* ============================================================================
   T-14 · Extend the exercise library.

   The library is per-gym and shared: a trainer adding "Landmine press" adds
   it for every trainer. Equipment is two fields on purpose — the coarse text
   vocabulary (Barbell/Dumbbell/...) drives filtering and stays free of the
   inventory, while the optional equipment_id points at the specific machine
   so the plan builder can warn when that machine is down.
   ========================================================================= */

const Save = z.object({
  id: z.uuid().optional(),
  name: z.string().trim().min(2).max(80),
  primary_muscle: z.enum(MUSCLES),
  secondary_muscles: z.string().trim().max(200).optional(),
  equipment: z.enum(EQUIPMENT_KINDS),
  equipment_id: z.union([z.uuid(), z.literal("")]).optional(),
  difficulty: z.enum(["beginner", "intermediate", "advanced"]),
  instructions: z.string().trim().max(1000).optional(),
  common_mistakes: z.string().trim().max(500).optional(),
  video_url: z.union([z.url(), z.literal("")]).optional(),
});

export async function saveExercise(form: FormData): Promise<ActionResult> {
  const actor = await requireActor();
  const role = actor.role as GymRole;

  const raw = Object.fromEntries(form);
  if (raw.id === "") delete raw.id;
  const parsed = Save.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: "Check the fields — name, muscle and equipment are required." };
  }
  const v = parsed.data;

  if (!can(role, "exercises", v.id ? "edit" : "create")) {
    return { ok: false, error: "You do not have permission to change the exercise library." };
  }

  const db = await createServerDb();
  const row = {
    name: v.name,
    primary_muscle: v.primary_muscle,
    secondary_muscles: v.secondary_muscles
      ? v.secondary_muscles.split(",").map((s) => s.trim()).filter(Boolean)
      : [],
    equipment: v.equipment,
    equipment_id: v.equipment_id || null,
    difficulty: v.difficulty,
    instructions: v.instructions || null,
    common_mistakes: v.common_mistakes || null,
    video_url: v.video_url || null,
  };

  const { error } = v.id
    ? await db.from("exercises").update(row).eq("id", v.id).eq("gym_id", actor.gymId)
    : await db.from("exercises").insert({ ...row, gym_id: actor.gymId, is_custom: true });

  if (error) {
    return {
      ok: false,
      error: error.code === "23505"
        ? "An exercise with that name already exists."
        : "Could not save the exercise.",
    };
  }

  revalidatePath("/trainer/exercises");
  return { ok: true, message: v.id ? "Saved." : `${v.name} added to the library.` };
}

/** Hard delete, owner-only. Plans and logged sets reference exercises with
 *  `on delete restrict`, so the database refuses to delete one that is in
 *  use — which is exactly right: a plan day or a member's history must not
 *  lose its exercise. Those get Hide instead. */
export async function deleteExercise(id: string): Promise<ActionResult> {
  const actor = await requireActor();
  if (!can(actor.role as GymRole, "exercises", "delete")) {
    return { ok: false, error: "Only the owner can delete exercises — hide it instead." };
  }

  const db = await createServerDb();
  const { data, error } = await db
    .from("exercises")
    .delete()
    .eq("id", id)
    .eq("gym_id", actor.gymId)
    .select("id");

  if (error) {
    return {
      ok: false,
      error: error.code === "23503"
        ? "This exercise is in a plan or in logged workouts, so it cannot be deleted — hide it instead."
        : "Could not delete the exercise.",
    };
  }
  if (!data?.length) return { ok: false, error: "Already gone — refresh the page." };

  revalidatePath("/trainer/exercises");
  return { ok: true, message: "Deleted." };
}

/** Hide, don't delete: plans and logged sets reference exercises with
 *  `on delete restrict`, so history depends on the row surviving. */
export async function deactivateExercise(id: string): Promise<ActionResult> {
  const actor = await requireActor();
  if (!can(actor.role as GymRole, "exercises", "edit")) {
    return { ok: false, error: "You do not have permission to change the exercise library." };
  }

  const db = await createServerDb();
  const { error } = await db
    .from("exercises")
    .update({ is_active: false })
    .eq("id", id)
    .eq("gym_id", actor.gymId);

  if (error) return { ok: false, error: "Could not hide the exercise." };

  revalidatePath("/trainer/exercises");
  return { ok: true, message: "Hidden from the library. Existing plans keep it." };
}
