"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createServerDb, requireActor } from "@/lib/db/server";
import { can } from "@/lib/auth/permissions";
import { rupeesToPaise } from "@/lib/money";
import type { GymRole } from "@/lib/db/database.types";
import type { ActionResult } from "./members";

/* ============================================================================
   Membership plans — what the gym sells.

   Until now these existed only because a bootstrap script inserted them, so a
   price could not be changed and a second gym could not be opened without a
   developer. This is that write surface.

   The thing to understand before touching a price: editing a plan is NOT
   retroactive, and that is deliberate rather than a limitation. A membership
   stores its own price_paise when it is sold, and its invoice is a numbered
   GST document recording what was actually charged. If changing a plan
   rewrote history, last month's invoices would silently stop matching the
   money that was banked against them. So a new price applies to the next sale
   and nothing else — the UI says so where the price is edited, because it is
   exactly the kind of thing someone assumes the other way round.
   ========================================================================= */

/* An unchecked box is absent from FormData, not "false", and z.coerce.boolean
   would read the STRING "false" as true if anything ever sent one. Decide the
   truthiness explicitly instead of relying on which of those happens. */
const checkbox = z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean());

const Save = z.object({
  id: z.uuid().optional(),
  name: z.string().trim().min(2).max(60),
  duration_days: z.coerce.number().int().min(1).max(3650),
  /* Rupees at the boundary, paise everywhere inside. Whole rupees only: gyms
     price at 3200, never 3200.50, and allowing paise here invites a rounding
     argument on an invoice for no gain. */
  price_rupees: z.coerce.number().int().min(0).max(10_00_000),
  joining_fee_rupees: z.coerce.number().int().min(0).max(10_00_000).default(0),
  pt_sessions: z.coerce.number().int().min(0).max(365).default(0),
  freeze_days_allowed: z.coerce.number().int().min(0).max(365).default(0),
  description: z.string().trim().max(300).optional(),
  sort_order: z.coerce.number().int().min(0).max(999).default(0),
  is_visible_to_members: checkbox,
  is_active: checkbox,
});

export async function savePlan(form: FormData): Promise<ActionResult> {
  const actor = await requireActor();
  const role = actor.role as GymRole;

  const raw = Object.fromEntries(form);
  if (raw.id === "") delete raw.id;
  const parsed = Save.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Check the fields — a name, a length in days and a price are required.",
    };
  }
  const v = parsed.data;

  if (!can(role, "memberships", v.id ? "edit" : "create")) {
    return { ok: false, error: "Only an owner or manager can change plans." };
  }

  const db = await createServerDb();
  const row = {
    name: v.name,
    duration_days: v.duration_days,
    price_paise: rupeesToPaise(v.price_rupees),
    joining_fee_paise: rupeesToPaise(v.joining_fee_rupees),
    pt_sessions: v.pt_sessions,
    freeze_days_allowed: v.freeze_days_allowed,
    description: v.description || null,
    sort_order: v.sort_order,
    is_visible_to_members: v.is_visible_to_members,
    is_active: v.is_active,
    updated_at: new Date().toISOString(),
  };

  const { error } = v.id
    ? await db.from("plans").update(row).eq("id", v.id).eq("gym_id", actor.gymId)
    : await db.from("plans").insert({ ...row, gym_id: actor.gymId });

  if (error) {
    return {
      ok: false,
      error:
        error.code === "23505"
          ? "A plan with that name already exists — edit that one instead."
          : "Could not save the plan.",
    };
  }

  revalidatePath("/admin/plans");
  revalidatePath("/m/membership");
  return {
    ok: true,
    message: v.id
      ? "Saved. Members already on this plan keep the price they paid — this applies to the next sale."
      : `${v.name} added.`,
  };
}

/**
 * Stop selling a plan without erasing it.
 *
 * This is the normal way a plan ends. Everyone currently on it keeps their
 * term, their invoices still resolve, and the renewal history on a member
 * profile still names the plan they were on.
 */
export async function setPlanActive(id: string, active: boolean): Promise<ActionResult> {
  const actor = await requireActor();
  if (!can(actor.role as GymRole, "memberships", "edit")) {
    return { ok: false, error: "Only an owner or manager can change plans." };
  }

  const db = await createServerDb();
  const { error } = await db
    .from("plans")
    /* Withdrawn from sale means withdrawn from the member app too. Leaving it
       visible would let someone pick a plan reception can no longer sell. */
    .update({ is_active: active, ...(active ? {} : { is_visible_to_members: false }) })
    .eq("id", id)
    .eq("gym_id", actor.gymId);

  if (error) return { ok: false, error: "Could not update the plan." };

  revalidatePath("/admin/plans");
  revalidatePath("/m/membership");
  return { ok: true, message: active ? "Back on sale." : "Withdrawn from sale." };
}

/**
 * Hard delete, and only for a plan nobody has ever been sold.
 *
 * memberships.plan_id is `on delete restrict`, so the database would refuse
 * this anyway — but it would refuse it as a foreign key violation, which
 * reaches the owner as "could not delete" and tells them nothing. Checking
 * first turns that into a sentence explaining why, and what to do instead.
 */
export async function deletePlan(id: string): Promise<ActionResult> {
  const actor = await requireActor();
  if (!can(actor.role as GymRole, "memberships", "delete")) {
    return { ok: false, error: "Only an owner can delete a plan." };
  }

  const db = await createServerDb();

  const { count } = await db
    .from("memberships")
    .select("id", { count: "exact", head: true })
    .eq("gym_id", actor.gymId)
    .eq("plan_id", id);

  if ((count ?? 0) > 0) {
    return {
      ok: false,
      error:
        `${count} membership${count === 1 ? " has" : "s have"} been sold on this plan, ` +
        "so deleting it would break their invoice history. Withdraw it from sale instead.",
    };
  }

  const { error } = await db.from("plans").delete().eq("id", id).eq("gym_id", actor.gymId);
  if (error) return { ok: false, error: "Could not delete the plan." };

  revalidatePath("/admin/plans");
  revalidatePath("/m/membership");
  return { ok: true, message: "Plan deleted." };
}
