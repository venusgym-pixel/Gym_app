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

/* Absent when unticked — HTML posts nothing for an unchecked box. Same shape
   as the plan editor's toggles. */
const checkbox = z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean());

const Settings = z.object({
  name: z.string().trim().min(2, "The gym needs a name"),
  address: z.string().trim().optional(),
  phone: z.string().trim().optional(),
  email: z.union([z.email(), z.literal("")]).optional(),
  gstin: z
    .union([z.string().trim().toUpperCase().regex(GSTIN, "That is not a valid GSTIN"), z.literal("")])
    .optional(),
  gst_enabled: checkbox,
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

  /* .select() on the update, deliberately.

     An UPDATE that row-level security refuses does not fail — it matches zero
     rows and comes back clean, so a screen that only checks `error` reports
     "Saved." over a database that changed nothing. That is not hypothetical
     here: it is exactly how the QR upload appeared to work while doing
     nothing. Asking for the row back means this can only claim to have saved
     something it can read back. */
  const { data, error } = await db
    .from("gyms")
    .update({
      name: v.name,
      address: v.address || null,
      phone: v.phone || null,
      email: v.email || null,
      gstin: v.gstin || null,
      gst_enabled: v.gst_enabled,
      reminder_hour: v.reminder_hour,
      updated_at: new Date().toISOString(),
    })
    .eq("id", actor.gymId)
    .select("gst_enabled")
    .maybeSingle();

  if (error) return { ok: false, error: "Could not save. Try again." };
  if (!data) {
    return {
      ok: false,
      error:
        "The database would not accept that change. Sign out and back in, then try again — if it keeps happening your account may have lost the settings permission.",
    };
  }

  const saved = (data as { gst_enabled: boolean }).gst_enabled;

  /* The whole admin tree, not three named routes. Tax now decides copy and
     figures on plans, the desk, payments, reports and the member app, and a
     list of paths is a thing that goes stale the next time one is added. */
  revalidatePath("/admin", "layout");
  revalidatePath("/m/membership");

  /* Says what is now true rather than that something happened. This is a
     money setting, and "Saved." next to a box that still looks ticked is how
     an owner ends up unsure which way round it is. */
  return {
    ok: true,
    message: saved
      ? "Saved. GST is on — 18% is added to every plan price."
      : "Saved. GST is off — plan prices are now the final price.",
  };
}
