"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createServerDb, requireActor } from "@/lib/db/server";
import { can } from "@/lib/auth/permissions";
import type { GymRole } from "@/lib/db/database.types";
import type { ActionResult } from "./members";

/* ============================================================================
   Equipment — the gym's actual kit, as data.

   The write surface is deliberately small: register a machine, correct its
   details, flip its status, retire it. Status is the field that matters
   day-to-day; everything else is a record the owner fills in once.
   ========================================================================= */

const CATEGORIES = [
  "machine", "free_weight", "cable", "cardio", "bench_rack", "accessory",
] as const;
const STATUSES = ["working", "maintenance", "out_of_order"] as const;

const Save = z.object({
  id: z.uuid().optional(),
  name: z.string().trim().min(2).max(80),
  category: z.enum(CATEGORIES),
  brand: z.string().trim().max(80).optional(),
  model: z.string().trim().max(80).optional(),
  quantity: z.coerce.number().int().min(1).max(999).default(1),
  status: z.enum(STATUSES).default("working"),
  photo_url: z.union([z.url(), z.literal("")]).optional(),
  purchased_on: z.string().optional(),
  notes: z.string().trim().max(500).optional(),
});

export async function saveEquipment(form: FormData): Promise<ActionResult> {
  const actor = await requireActor();
  const role = actor.role as GymRole;

  const raw = Object.fromEntries(form);
  if (raw.id === "") delete raw.id;
  const parsed = Save.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: "Check the fields — name and category are required, and the photo must be a URL." };
  }
  const v = parsed.data;

  if (!can(role, "equipment", v.id ? "edit" : "create")) {
    return { ok: false, error: "Only an owner or manager can change the equipment list." };
  }

  const db = await createServerDb();
  const row = {
    name: v.name,
    category: v.category,
    brand: v.brand || null,
    model: v.model || null,
    quantity: v.quantity,
    status: v.status,
    photo_url: v.photo_url || null,
    purchased_on: v.purchased_on || null,
    notes: v.notes || null,
  };

  const { error } = v.id
    ? await db.from("equipment").update(row).eq("id", v.id).eq("gym_id", actor.gymId)
    : await db.from("equipment").insert({ ...row, gym_id: actor.gymId });

  if (error) {
    return {
      ok: false,
      error: error.code === "23505"
        ? "A machine with that name already exists — edit it instead."
        : "Could not save the equipment.",
    };
  }

  revalidatePath("/admin/equipment");
  return { ok: true, message: v.id ? "Saved." : `${v.name} added to the floor.` };
}

/** The everyday write: the leg press broke, mark it so trainers see it. */
export async function setEquipmentStatus(
  id: string,
  status: (typeof STATUSES)[number],
): Promise<ActionResult> {
  const actor = await requireActor();
  if (!can(actor.role as GymRole, "equipment", "edit")) {
    return { ok: false, error: "Only an owner or manager can change equipment status." };
  }
  if (!STATUSES.includes(status)) return { ok: false, error: "Unknown status." };

  const db = await createServerDb();
  const { error } = await db
    .from("equipment")
    .update({ status })
    .eq("id", id)
    .eq("gym_id", actor.gymId);

  if (error) return { ok: false, error: "Could not update the status." };

  revalidatePath("/admin/equipment");
  return { ok: true, message: "Status updated." };
}

/** Soft delete: sold or scrapped kit disappears from lists, but exercises
 *  that pointed at it keep their history (the FK is on delete set null only
 *  for hard deletes, which we never do from the app). */
export async function retireEquipment(id: string): Promise<ActionResult> {
  const actor = await requireActor();
  if (!can(actor.role as GymRole, "equipment", "delete")) {
    return { ok: false, error: "Only an owner or manager can retire equipment." };
  }

  const db = await createServerDb();
  const { error } = await db
    .from("equipment")
    .update({ is_active: false })
    .eq("id", id)
    .eq("gym_id", actor.gymId);

  if (error) return { ok: false, error: "Could not retire the equipment." };

  revalidatePath("/admin/equipment");
  return { ok: true, message: "Retired. It no longer appears to trainers." };
}

/** Hard delete — for kit added by mistake or gone for good. Exercises that
 *  pointed at it keep working: the FK is `on delete set null`, so they just
 *  lose the machine link (and with it the down-machine warning). */
export async function deleteEquipment(id: string): Promise<ActionResult> {
  const actor = await requireActor();
  if (!can(actor.role as GymRole, "equipment", "delete")) {
    return { ok: false, error: "Only an owner or manager can delete equipment." };
  }

  const db = await createServerDb();
  const { data, error } = await db
    .from("equipment")
    .delete()
    .eq("id", id)
    .eq("gym_id", actor.gymId)
    .select("id");

  if (error) return { ok: false, error: "Could not delete the equipment." };
  if (!data?.length) return { ok: false, error: "Already gone — refresh the page." };

  revalidatePath("/admin/equipment");
  return { ok: true, message: "Deleted." };
}

/** One-click starter inventory, mirroring seed_gym_exercises. */
export async function seedEquipment(): Promise<ActionResult> {
  const actor = await requireActor();
  if (!can(actor.role as GymRole, "equipment", "create")) {
    return { ok: false, error: "Only an owner or manager can load the starter list." };
  }

  const db = await createServerDb();
  const { data, error } = await db.rpc("seed_gym_equipment", { p_gym_id: actor.gymId });

  if (error) return { ok: false, error: "Could not load the starter list." };

  revalidatePath("/admin/equipment");
  const n = typeof data === "number" ? data : 0;
  return {
    ok: true,
    message: n > 0 ? `Added ${n} items — rename or retire to match your floor.` : "Everything on the starter list already exists.",
  };
}
