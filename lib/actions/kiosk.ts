"use server";

import { revalidatePath } from "next/cache";
import { createServerDb, requireActor } from "@/lib/db/server";
import { can } from "@/lib/auth/permissions";
import type { GymRole } from "@/lib/db/database.types";
import type { ActionResult } from "./members";

/* ============================================================================
   The printed wall poster.

   A poster is a kiosk device that signs a nonce instead of a time window. The
   secret never changes and never leaves the server; the nonce is the identity
   of the particular sheet currently on the wall.

   "Print a new one" is therefore the whole security model, and it is manual on
   purpose. A rotating printed code would be a contradiction — paper cannot
   rotate — so the owner decides when a sheet has been around long enough, or
   has leaked, and replaces it. The moment they do, every copy of the old one
   stops working, including photographs of it.
   ========================================================================= */

/** A short nonce: it goes in the QR, and a smaller code scans from further. */
function newNonce(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 12);
}

export async function createOrRotatePoster(): Promise<ActionResult> {
  const actor = await requireActor();
  if (!can(actor.role as GymRole, "settings", "edit")) {
    return { ok: false, error: "Only an owner or manager can change the wall code." };
  }

  const db = await createServerDb();

  /* Reuse the gym's existing poster device if it has one, so rotating replaces
     the sheet rather than accumulating a new device per reprint. */
  const { data: existing } = await db
    .from("kiosk_devices")
    .select("id")
    .eq("gym_id", actor.gymId)
    .not("poster_nonce", "is", null)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  const patch = { poster_nonce: newNonce(), poster_printed_at: new Date().toISOString() };
  const id = (existing as { id: string } | null)?.id;

  const { error } = id
    ? await db.from("kiosk_devices").update(patch).eq("id", id).eq("gym_id", actor.gymId)
    : await db.from("kiosk_devices").insert({
        gym_id: actor.gymId,
        name: "Wall poster",
        ...patch,
      });

  if (error) return { ok: false, error: "Could not update the wall code." };

  revalidatePath("/admin/kiosk/poster");
  return {
    ok: true,
    message: id
      ? "New code ready. Print it and replace the sheet on the wall — the old one no longer works."
      : "Poster created. Print it and put it up where members come in.",
  };
}
