"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createServerDb, requireActor, type Actor } from "@/lib/db/server";
import { can, type Action } from "@/lib/auth/permissions";
import type { GymRole } from "@/lib/db/database.types";
import type { ActionResult } from "./members";

/* ============================================================================
   T-10 · The workout plan builder's write side.

   Structure lives in three tables (plan -> days -> exercises) with two
   constraints that shape every mutation here:

     unique (plan_id, day_index)  — and todays_workout() rotates by
       (sessions % day_count) + 1, so day indexes must stay 1..n with NO GAPS
       or a member's workout screen goes blank on the missing day. Deleting a
       day therefore reindexes the rest, ascending, each target slot freshly
       vacated.

     unique (day_id, position)    — so reordering swaps through a parking
       value (32000, comfortably above the ~20-exercise ceiling a day can
       realistically hold) rather than colliding mid-swap.

   Sessions snapshot their targets, so edits here change what members see
   NEXT time and never rewrite a logged workout.
   ========================================================================= */

async function gate(action: Action): Promise<{ actor: Actor } | { error: ActionResult }> {
  const actor = await requireActor();
  if (!can(actor.role as GymRole, "workouts", action)) {
    return { error: { ok: false, error: "You do not have permission to edit workout plans." } };
  }
  return { actor };
}

function refresh(planId?: string) {
  revalidatePath("/trainer/plans");
  if (planId) revalidatePath(`/trainer/plans/${planId}`);
}

/* ── the plan itself ────────────────────────────────────────────────────── */

const Create = z.object({
  name: z.string().trim().min(2).max(80),
  goal: z.string().trim().max(120).optional(),
  days_per_week: z.coerce.number().int().min(1).max(7),
  is_template: z.coerce.boolean().optional(),
});

export async function createPlan(form: FormData): Promise<ActionResult> {
  const g = await gate("create");
  if ("error" in g) return g.error;
  const { actor } = g;

  const parsed = Create.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { ok: false, error: "Give the plan a name and 1–7 days." };
  const v = parsed.data;

  const db = await createServerDb();
  const { data: plan, error } = await db
    .from("workout_plans")
    .insert({
      gym_id: actor.gymId,
      name: v.name,
      goal: v.goal || null,
      days_per_week: v.days_per_week,
      created_by: actor.userId,
      is_template: !!v.is_template,
    })
    .select("id")
    .single();

  if (error || !plan) return { ok: false, error: "Could not create the plan." };

  /* Empty days up front, so the editor opens showing the split's shape and
     the trainer names days instead of building scaffolding. */
  const days = Array.from({ length: v.days_per_week }, (_, i) => ({
    gym_id: actor.gymId,
    plan_id: plan.id as string,
    day_index: i + 1,
    name: `Day ${i + 1}`,
  }));
  const { error: dayErr } = await db.from("workout_days").insert(days);
  if (dayErr) return { ok: false, error: "Created the plan but not its days — open it and add them." };

  refresh(plan.id as string);
  redirect(`/trainer/plans/${plan.id}`);
}

const Meta = z.object({
  plan_id: z.uuid(),
  name: z.string().trim().min(2).max(80),
  goal: z.string().trim().max(120).optional(),
  is_template: z.coerce.boolean().optional(),
});

export async function updatePlanMeta(form: FormData): Promise<ActionResult> {
  const g = await gate("edit");
  if ("error" in g) return g.error;
  const { actor } = g;

  const parsed = Meta.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { ok: false, error: "The plan needs a name." };
  const v = parsed.data;

  const db = await createServerDb();
  const { error } = await db
    .from("workout_plans")
    .update({ name: v.name, goal: v.goal || null, is_template: !!v.is_template })
    .eq("id", v.plan_id)
    .eq("gym_id", actor.gymId);

  if (error) return { ok: false, error: "Could not save the plan details." };

  refresh(v.plan_id);
  return { ok: true, message: "Saved." };
}

export async function deactivatePlan(planId: string): Promise<ActionResult> {
  const g = await gate("delete");
  if ("error" in g) return g.error;
  const { actor } = g;

  const db = await createServerDb();

  /* Refuse rather than strand: todays_workout() ignores is_active, so members
     on the plan would keep training an archived programme without anyone
     noticing. Move them first, then archive. */
  const { count } = await db
    .from("workout_assignments")
    .select("id", { count: "exact", head: true })
    .eq("gym_id", actor.gymId)
    .eq("plan_id", planId)
    .is("ends_on", null);

  if ((count ?? 0) > 0) {
    return {
      ok: false,
      error: `${count} member${count === 1 ? " is" : "s are"} still on this plan — assign them another one first.`,
    };
  }

  const { error } = await db
    .from("workout_plans")
    .update({ is_active: false })
    .eq("id", planId)
    .eq("gym_id", actor.gymId);

  if (error) return { ok: false, error: "Could not archive the plan." };

  refresh(planId);
  return { ok: true, message: "Plan archived." };
}

/* ── days ───────────────────────────────────────────────────────────────── */

export async function addDay(planId: string): Promise<ActionResult> {
  const g = await gate("edit");
  if ("error" in g) return g.error;
  const { actor } = g;

  const db = await createServerDb();
  const { data: days } = await db
    .from("workout_days")
    .select("day_index")
    .eq("gym_id", actor.gymId)
    .eq("plan_id", planId)
    .order("day_index", { ascending: false })
    .limit(1);

  const next = ((days?.[0]?.day_index as number | undefined) ?? 0) + 1;
  if (next > 7) return { ok: false, error: "A plan holds at most 7 days." };

  const { error } = await db.from("workout_days").insert({
    gym_id: actor.gymId,
    plan_id: planId,
    day_index: next,
    name: `Day ${next}`,
  });
  if (error) return { ok: false, error: "Could not add the day." };

  await db
    .from("workout_plans")
    .update({ days_per_week: next })
    .eq("id", planId)
    .eq("gym_id", actor.gymId);

  refresh(planId);
  return { ok: true, message: `Day ${next} added.` };
}

const Rename = z.object({
  day_id: z.uuid(),
  plan_id: z.uuid(),
  name: z.string().trim().min(1).max(60),
});

export async function renameDay(form: FormData): Promise<ActionResult> {
  const g = await gate("edit");
  if ("error" in g) return g.error;
  const { actor } = g;

  const parsed = Rename.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { ok: false, error: "Give the day a name." };
  const v = parsed.data;

  const db = await createServerDb();
  const { error } = await db
    .from("workout_days")
    .update({ name: v.name })
    .eq("id", v.day_id)
    .eq("gym_id", actor.gymId);

  if (error) return { ok: false, error: "Could not rename the day." };

  refresh(v.plan_id);
  return { ok: true, message: "Renamed." };
}

export async function deleteDay(dayId: string, planId: string): Promise<ActionResult> {
  const g = await gate("delete");
  if ("error" in g) return g.error;
  const { actor } = g;

  const db = await createServerDb();
  const { error } = await db
    .from("workout_days")
    .delete()
    .eq("id", dayId)
    .eq("gym_id", actor.gymId)
    .eq("plan_id", planId);

  if (error) return { ok: false, error: "Could not delete the day." };

  /* Close the gap. Ascending order: each day moves into a slot the previous
     step (or the delete itself) just vacated, so unique (plan_id, day_index)
     never trips. */
  const { data: rest } = await db
    .from("workout_days")
    .select("id, day_index")
    .eq("gym_id", actor.gymId)
    .eq("plan_id", planId)
    .order("day_index");

  const days = rest ?? [];
  for (let i = 0; i < days.length; i++) {
    if (days[i].day_index !== i + 1) {
      await db
        .from("workout_days")
        .update({ day_index: i + 1 })
        .eq("id", days[i].id)
        .eq("gym_id", actor.gymId);
    }
  }

  await db
    .from("workout_plans")
    .update({ days_per_week: Math.max(1, days.length) })
    .eq("id", planId)
    .eq("gym_id", actor.gymId);

  refresh(planId);
  return { ok: true, message: "Day removed." };
}

/* ── exercises within a day ─────────────────────────────────────────────── */

const AddItem = z.object({
  day_id: z.uuid(),
  plan_id: z.uuid(),
  exercise_id: z.uuid(),
});

export async function addExerciseToDay(form: FormData): Promise<ActionResult> {
  const g = await gate("edit");
  if ("error" in g) return g.error;
  const { actor } = g;

  const parsed = AddItem.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { ok: false, error: "Pick an exercise." };
  const v = parsed.data;

  const db = await createServerDb();
  const { data: last } = await db
    .from("workout_exercises")
    .select("position")
    .eq("gym_id", actor.gymId)
    .eq("day_id", v.day_id)
    .order("position", { ascending: false })
    .limit(1);

  const { error } = await db.from("workout_exercises").insert({
    gym_id: actor.gymId,
    day_id: v.day_id,
    exercise_id: v.exercise_id,
    position: ((last?.[0]?.position as number | undefined) ?? 0) + 1,
  });

  if (error) return { ok: false, error: "Could not add the exercise." };

  refresh(v.plan_id);
  return { ok: true, message: "Added — set the targets." };
}

const Targets = z.object({
  item_id: z.uuid(),
  plan_id: z.uuid(),
  sets: z.coerce.number().int().min(1).max(20),
  target_reps: z.coerce.number().int().min(1).max(100),
  target_weight_kg: z.string().optional(),
  rest_seconds: z.coerce.number().int().min(0).max(600),
  notes: z.string().trim().max(200).optional(),
});

export async function updateItemTargets(form: FormData): Promise<ActionResult> {
  const g = await gate("edit");
  if ("error" in g) return g.error;
  const { actor } = g;

  const parsed = Targets.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { ok: false, error: "Sets 1–20, reps 1–100, rest 0–600s." };
  const v = parsed.data;

  const weight =
    v.target_weight_kg && v.target_weight_kg.trim() !== "" && !Number.isNaN(Number(v.target_weight_kg))
      ? Number(v.target_weight_kg)
      : null;

  const db = await createServerDb();
  const { error } = await db
    .from("workout_exercises")
    .update({
      sets: v.sets,
      target_reps: v.target_reps,
      target_weight_kg: weight,
      rest_seconds: v.rest_seconds,
      notes: v.notes || null,
    })
    .eq("id", v.item_id)
    .eq("gym_id", actor.gymId);

  if (error) return { ok: false, error: "Could not save the targets." };

  refresh(v.plan_id);
  return { ok: true, message: "Targets saved." };
}

export async function removeItem(itemId: string, planId: string): Promise<ActionResult> {
  const g = await gate("delete");
  if ("error" in g) return g.error;
  const { actor } = g;

  const db = await createServerDb();
  const { data: item } = await db
    .from("workout_exercises")
    .select("day_id")
    .eq("id", itemId)
    .eq("gym_id", actor.gymId)
    .single();
  if (!item) return { ok: false, error: "That exercise is already gone." };

  const { error } = await db
    .from("workout_exercises")
    .delete()
    .eq("id", itemId)
    .eq("gym_id", actor.gymId);
  if (error) return { ok: false, error: "Could not remove the exercise." };

  /* Compact positions the same way deleteDay compacts day indexes. */
  const { data: rest } = await db
    .from("workout_exercises")
    .select("id, position")
    .eq("gym_id", actor.gymId)
    .eq("day_id", item.day_id as string)
    .order("position");

  const items = rest ?? [];
  for (let i = 0; i < items.length; i++) {
    if (items[i].position !== i + 1) {
      await db
        .from("workout_exercises")
        .update({ position: i + 1 })
        .eq("id", items[i].id)
        .eq("gym_id", actor.gymId);
    }
  }

  refresh(planId);
  return { ok: true, message: "Removed." };
}

export async function moveItem(
  itemId: string,
  planId: string,
  direction: "up" | "down",
): Promise<ActionResult> {
  const g = await gate("edit");
  if ("error" in g) return g.error;
  const { actor } = g;

  const db = await createServerDb();
  const { data: item } = await db
    .from("workout_exercises")
    .select("id, day_id, position")
    .eq("id", itemId)
    .eq("gym_id", actor.gymId)
    .single();
  if (!item) return { ok: false, error: "That exercise is gone — refresh." };

  const neighbourPos = (item.position as number) + (direction === "up" ? -1 : 1);
  const { data: neighbours } = await db
    .from("workout_exercises")
    .select("id, position")
    .eq("gym_id", actor.gymId)
    .eq("day_id", item.day_id as string)
    .eq("position", neighbourPos)
    .limit(1);

  const neighbour = neighbours?.[0];
  if (!neighbour) return { ok: true, message: "Already at the end." };

  /* Three hops through the parking slot; unique (day_id, position) allows no
     direct swap. */
  const park = 32000;
  const steps = [
    db.from("workout_exercises").update({ position: park }).eq("id", item.id).eq("gym_id", actor.gymId),
    db.from("workout_exercises").update({ position: item.position }).eq("id", neighbour.id).eq("gym_id", actor.gymId),
    db.from("workout_exercises").update({ position: neighbourPos }).eq("id", item.id).eq("gym_id", actor.gymId),
  ];
  for (const step of steps) {
    const { error } = await step;
    if (error) return { ok: false, error: "Could not reorder — refresh and try again." };
  }

  refresh(planId);
  return { ok: true, message: "Moved." };
}
