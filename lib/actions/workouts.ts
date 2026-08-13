"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createServerDb, requireActor } from "@/lib/db/server";
import { can } from "@/lib/auth/permissions";
import type { GymRole } from "@/lib/db/database.types";
import type { ActionResult } from "./members";

/* ============================================================================
   The coaching loop's write side.

   Set logging goes through a Route Handler instead (app/api/workout/*) so the
   member surface stays Expo-portable per ADR-2. What lives here is the
   trainer's half: assigning plans and recording measurements — admin-surface
   work that will never run on a phone app.
   ========================================================================= */

const Assign = z.object({
  member_id: z.uuid(),
  plan_id: z.uuid(),
  note: z.string().optional(),
});

export async function assignPlan(form: FormData): Promise<ActionResult> {
  const actor = await requireActor();
  if (!can(actor.role as GymRole, "workouts", "create")) {
    return { ok: false, error: "You do not have permission to assign workouts." };
  }

  const parsed = Assign.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { ok: false, error: "Choose a plan." };
  const v = parsed.data;

  const db = await createServerDb();

  /* One live plan per member — workout_assignments_one_live enforces it, so
     close the current one rather than letting the insert fail with a
     constraint error the receptionist cannot interpret. */
  await db
    .from("workout_assignments")
    .update({ ends_on: new Date().toISOString().slice(0, 10) })
    .eq("gym_id", actor.gymId)
    .eq("member_id", v.member_id)
    .is("ends_on", null);

  const { error } = await db.from("workout_assignments").insert({
    gym_id: actor.gymId,
    member_id: v.member_id,
    plan_id: v.plan_id,
    assigned_by: actor.userId,
    note: v.note || null,
  });

  if (error) return { ok: false, error: "Could not assign the plan." };

  revalidatePath(`/trainer/clients/${v.member_id}`);
  revalidatePath("/trainer");
  return { ok: true, message: "Plan assigned. It shows on their phone straight away." };
}

/** Link a member to a trainer — what scope 'assigned' actually reads. */
export async function assignTrainer(
  memberId: string,
  trainerId: string,
): Promise<ActionResult> {
  const actor = await requireActor();
  if (!can(actor.role as GymRole, "staff", "edit")) {
    return { ok: false, error: "Only an owner or manager can assign trainers." };
  }

  const db = await createServerDb();
  const { error } = await db
    .from("trainer_clients")
    .upsert(
      { gym_id: actor.gymId, trainer_id: trainerId, member_id: memberId, ended_on: null },
      { onConflict: "gym_id,trainer_id,member_id" },
    );

  if (error) return { ok: false, error: "Could not assign the trainer." };

  revalidatePath(`/admin/members/${memberId}`);
  return { ok: true, message: "Trainer assigned." };
}

const Measure = z.object({
  member_id: z.uuid(),
  weight_kg: z.string().optional(),
  body_fat_pct: z.string().optional(),
  chest_cm: z.string().optional(),
  waist_cm: z.string().optional(),
  hip_cm: z.string().optional(),
  biceps_cm: z.string().optional(),
  thigh_cm: z.string().optional(),
  note: z.string().optional(),
});

const num = (v: string | undefined) =>
  v && v.trim() !== "" && !Number.isNaN(Number(v)) ? Number(v) : null;

export async function recordMeasurement(form: FormData): Promise<ActionResult> {
  const actor = await requireActor();
  if (!can(actor.role as GymRole, "progress", "create")) {
    return { ok: false, error: "You do not have permission to record measurements." };
  }

  const parsed = Measure.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { ok: false, error: "Check the numbers." };
  const v = parsed.data;

  const db = await createServerDb();

  /* One row per member per day: a second weigh-in the same afternoon is a
     correction, not a new point on the chart. */
  const { error } = await db.from("measurements").upsert(
    {
      gym_id: actor.gymId,
      member_id: v.member_id,
      taken_on: new Date().toISOString().slice(0, 10),
      weight_kg: num(v.weight_kg),
      body_fat_pct: num(v.body_fat_pct),
      chest_cm: num(v.chest_cm),
      waist_cm: num(v.waist_cm),
      hip_cm: num(v.hip_cm),
      biceps_cm: num(v.biceps_cm),
      thigh_cm: num(v.thigh_cm),
      note: v.note || null,
      recorded_by: actor.userId,
    },
    { onConflict: "member_id,taken_on" },
  );

  if (error) return { ok: false, error: "Could not save the measurement." };

  revalidatePath("/m/progress");
  revalidatePath(`/trainer/clients/${v.member_id}`);
  return { ok: true, message: "Saved." };
}
