"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createServerDb, requireActor } from "@/lib/db/server";
import { can } from "@/lib/auth/permissions";
import type { GymRole } from "@/lib/db/database.types";
import type { ActionResult } from "./members";

/* ============================================================================
   A-35 · Message templates, A-36 · the reminder ladder.

   The ladder is seeded on gym creation so the engine works out of the box.
   What an owner actually wants to change is the wording — theirs, in their
   voice — and which steps run at all. Both are edits to existing rows; no
   creation, no deletion. A gym inventing its own rule keys would break the
   dedup index the whole outbox depends on.
   ========================================================================= */

const Template = z.object({
  id: z.uuid(),
  subject: z.string().optional(),
  body: z.string().trim().min(4, "The message cannot be empty"),
});

export async function saveTemplate(
  _prev: ActionResult | null,
  form: FormData,
): Promise<ActionResult> {
  const actor = await requireActor();
  if (!can(actor.role as GymRole, "messaging", "edit")) {
    return { ok: false, error: "You do not have permission to edit messages." };
  }

  const parsed = Template.safeParse(Object.fromEntries(form));
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the message." };
  }
  const v = parsed.data;

  const db = await createServerDb();
  const { error } = await db
    .from("message_templates")
    .update({
      body: v.body,
      subject: v.subject || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", v.id)
    .eq("gym_id", actor.gymId);

  if (error) return { ok: false, error: "Could not save the message." };

  revalidatePath("/admin/messaging");
  return { ok: true, message: "Saved. The next reminder uses this wording." };
}

export async function toggleRule(form: FormData): Promise<ActionResult> {
  const actor = await requireActor();
  if (!can(actor.role as GymRole, "messaging", "edit")) {
    return { ok: false, error: "You do not have permission to change reminders." };
  }

  const id = String(form.get("id") ?? "");
  const on = String(form.get("on") ?? "") === "1";
  if (!id) return { ok: false, error: "Missing rule." };

  const db = await createServerDb();
  const { error } = await db
    .from("reminder_rules")
    .update({ is_active: on })
    .eq("id", id)
    .eq("gym_id", actor.gymId);

  if (error) return { ok: false, error: "Could not update the reminder." };

  revalidatePath("/admin/messaging");
  return { ok: true, message: on ? "Reminder on." : "Reminder off." };
}

/**
 * Put a failed message back in the queue.
 *
 * Resets attempts rather than incrementing: the drain worker gives up after
 * three, and a human choosing to retry — usually after fixing a phone number
 * — is a new decision, not a fourth automatic attempt.
 */
export async function retryMessage(form: FormData): Promise<ActionResult> {
  const actor = await requireActor();
  if (!can(actor.role as GymRole, "messaging", "edit")) {
    return { ok: false, error: "You do not have permission to resend." };
  }

  const id = String(form.get("id") ?? "");
  if (!id) return { ok: false, error: "Missing message." };

  const db = await createServerDb();
  const { error } = await db
    .from("notification_outbox")
    .update({
      status: "queued",
      attempts: 0,
      error: null,
      next_attempt_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("gym_id", actor.gymId)
    .in("status", ["failed", "cancelled"]);

  if (error) return { ok: false, error: "Could not requeue that message." };

  revalidatePath("/admin/messaging");
  return { ok: true, message: "Requeued. It goes out with the next drain." };
}
