"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createServerDb, requireActor } from "@/lib/db/server";
import { can } from "@/lib/auth/permissions";
import type { GymRole } from "@/lib/db/database.types";
import type { ActionResult } from "./members";

/* ============================================================================
   A-42 · Gym profile.

   The GSTIN is the field that matters: invoices print a warning without one
   and are not compliant, and until now the only way to set it was the
   Supabase dashboard.

   Slug, timezone and currency are deliberately not editable here. The slug
   appears in URLs members may have bookmarked, and changing the timezone
   silently re-times every scheduled reminder — both are support requests, not
   self-serve toggles.
   ========================================================================= */

/* Format: 2-digit state code, 10-char PAN, 1 entity digit, 'Z', 1 checksum.
   Validated because a wrong GSTIN on an invoice is the customer's problem
   with their accountant, discovered months later. */
const GSTIN = /^\d{2}[A-Z]{5}\d{4}[A-Z]\d[A-Z][0-9A-Z]$/;

const Settings = z.object({
  name: z.string().trim().min(2, "The gym needs a name"),
  address: z.string().trim().optional(),
  phone: z.string().trim().optional(),
  email: z.union([z.email(), z.literal("")]).optional(),
  gstin: z
    .union([z.string().trim().toUpperCase().regex(GSTIN, "That is not a valid GSTIN"), z.literal("")])
    .optional(),
  reminder_hour: z.coerce.number().int().min(0).max(23),
});

export async function saveGymSettings(
  _prev: ActionResult | null,
  form: FormData,
): Promise<ActionResult> {
  const actor = await requireActor();
  if (!can(actor.role as GymRole, "settings", "edit")) {
    return { ok: false, error: "Only an owner can change gym settings." };
  }

  const parsed = Settings.safeParse(Object.fromEntries(form));
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form." };
  }
  const v = parsed.data;

  const db = await createServerDb();
  const { error } = await db
    .from("gyms")
    .update({
      name: v.name,
      address: v.address || null,
      phone: v.phone || null,
      email: v.email || null,
      gstin: v.gstin || null,
      reminder_hour: v.reminder_hour,
      updated_at: new Date().toISOString(),
    })
    .eq("id", actor.gymId);

  if (error) return { ok: false, error: "Could not save. Try again." };

  revalidatePath("/admin/settings");
  revalidatePath("/admin");
  return { ok: true, message: "Saved." };
}
