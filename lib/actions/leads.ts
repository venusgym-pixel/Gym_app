"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createServerDb, requireActor } from "@/lib/db/server";
import { can } from "@/lib/auth/permissions";
import type { GymRole } from "@/lib/db/database.types";
import type { ActionResult } from "./members";

/* ============================================================================
   A-26 … A-29 · The enquiry pipeline.

   Every write here also writes a lead_activities row. A pipeline with no
   history is a set of guesses about what was said — and the first argument
   about "we called them twice" settles itself if the calls are logged.
   ========================================================================= */

const STATUSES = ["new", "contacted", "trial_booked", "trial_done", "won", "lost"] as const;

const NewLead = z.object({
  full_name: z.string().trim().min(2, "Name is required"),
  phone: z.string().trim().regex(/^[6-9]\d{9}$/, "Enter a 10-digit Indian mobile"),
  email: z.union([z.email(), z.literal("")]).optional(),
  source: z.string().trim().optional(),
  interested_plan_id: z.union([z.uuid(), z.literal("")]).optional(),
  next_follow_up_on: z.union([z.iso.date(), z.literal("")]).optional(),
  notes: z.string().trim().optional(),
});

export async function createLead(
  _prev: ActionResult | null,
  form: FormData,
): Promise<ActionResult> {
  const actor = await requireActor();
  if (!can(actor.role as GymRole, "leads", "create")) {
    return { ok: false, error: "You do not have permission to add enquiries." };
  }

  const parsed = NewLead.safeParse(Object.fromEntries(form));
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form." };
  }
  const v = parsed.data;

  const db = await createServerDb();

  /* Default the follow-up to tomorrow when nobody sets one. A lead with no
     date never appears on the worklist, which is exactly the failure this
     table exists to prevent. */
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);

  const { data, error } = await db
    .from("leads")
    .insert({
      gym_id: actor.gymId,
      full_name: v.full_name,
      phone: "+91" + v.phone,
      email: v.email || null,
      source: v.source || null,
      interested_plan_id: v.interested_plan_id || null,
      next_follow_up_on: v.next_follow_up_on || tomorrow,
      notes: v.notes || null,
      created_by: actor.userId,
    })
    .select("id")
    .single();

  if (error) {
    return {
      ok: false,
      error: error.code === "23505"
        ? "That number is already in the pipeline."
        : "Could not save the enquiry.",
    };
  }

  await db.from("lead_activities").insert({
    gym_id: actor.gymId,
    lead_id: (data as { id: string }).id,
    kind: "note",
    body: `Enquiry captured${v.source ? ` — ${v.source}` : ""}`,
    created_by: actor.userId,
  });

  revalidatePath("/admin/leads");
  return { ok: true, id: (data as { id: string }).id, message: `${v.full_name} added.` };
}

/* ── moving a lead along ──────────────────────────────────────────────────── */

const Update = z.object({
  id: z.uuid(),
  status: z.enum(STATUSES).optional(),
  next_follow_up_on: z.union([z.iso.date(), z.literal("")]).optional(),
  trial_on: z.union([z.iso.date(), z.literal("")]).optional(),
  lost_reason: z.string().trim().optional(),
});

export async function updateLead(form: FormData): Promise<ActionResult> {
  const actor = await requireActor();
  if (!can(actor.role as GymRole, "leads", "edit")) {
    return { ok: false, error: "You do not have permission to update enquiries." };
  }

  const parsed = Update.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { ok: false, error: "Could not read that change." };
  const v = parsed.data;

  const db = await createServerDb();

  const patch: Record<string, unknown> = {};
  if (v.status) patch.status = v.status;
  if (v.next_follow_up_on !== undefined) patch.next_follow_up_on = v.next_follow_up_on || null;
  if (v.trial_on !== undefined) patch.trial_on = v.trial_on || null;
  if (v.lost_reason) patch.lost_reason = v.lost_reason;

  /* A closed lead should stop appearing on the worklist. Clearing the date
     here rather than asking the user to do it means "lost" actually means
     off my list. */
  if (v.status === "lost" || v.status === "won") patch.next_follow_up_on = null;

  const { error } = await db
    .from("leads")
    .update(patch)
    .eq("id", v.id)
    .eq("gym_id", actor.gymId);

  if (error) return { ok: false, error: "Could not update the enquiry." };

  if (v.status) {
    await db.from("lead_activities").insert({
      gym_id: actor.gymId,
      lead_id: v.id,
      kind: "status",
      body: `Moved to ${v.status.replace("_", " ")}${v.lost_reason ? ` — ${v.lost_reason}` : ""}`,
      created_by: actor.userId,
    });
  }

  revalidatePath("/admin/leads");
  return { ok: true, message: "Updated." };
}

export async function logActivity(form: FormData): Promise<ActionResult> {
  const actor = await requireActor();
  if (!can(actor.role as GymRole, "leads", "edit")) {
    return { ok: false, error: "You do not have permission to log calls." };
  }

  const leadId = String(form.get("lead_id") ?? "");
  const body = String(form.get("body") ?? "").trim();
  const kind = String(form.get("kind") ?? "note");
  const followUp = String(form.get("next_follow_up_on") ?? "");

  if (!leadId || body.length < 2) return { ok: false, error: "Write what happened." };

  const db = await createServerDb();
  const { error } = await db.from("lead_activities").insert({
    gym_id: actor.gymId,
    lead_id: leadId,
    kind,
    body,
    created_by: actor.userId,
  });

  if (error) return { ok: false, error: "Could not save the note." };

  /* Logging a call almost always comes with "try again Thursday". Taking the
     next date in the same form is what keeps the pipeline from going stale. */
  if (followUp) {
    await db
      .from("leads")
      .update({ next_follow_up_on: followUp, status: "contacted" })
      .eq("id", leadId)
      .eq("gym_id", actor.gymId)
      .eq("status", "new");

    await db
      .from("leads")
      .update({ next_follow_up_on: followUp })
      .eq("id", leadId)
      .eq("gym_id", actor.gymId);
  }

  revalidatePath("/admin/leads");
  return { ok: true, message: "Logged." };
}

export async function convertLead(form: FormData): Promise<ActionResult> {
  const actor = await requireActor();
  if (
    !can(actor.role as GymRole, "leads", "edit") ||
    !can(actor.role as GymRole, "members", "create")
  ) {
    return { ok: false, error: "You need permission to add members to convert a lead." };
  }

  const id = String(form.get("id") ?? "");
  if (!id) return { ok: false, error: "Missing enquiry." };

  const db = await createServerDb();
  const { data, error } = await db.rpc("convert_lead", { p_lead_id: id });

  if (error) return { ok: false, error: "Could not convert. Check the phone number." };

  revalidatePath("/admin/leads");
  revalidatePath("/admin/members");
  return {
    ok: true,
    id: data as unknown as string,
    message: "Member created. Take the payment from their profile.",
  };
}
