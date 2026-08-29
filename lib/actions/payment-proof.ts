"use server";

import { revalidatePath } from "next/cache";
import { createServerDb, requireActor } from "@/lib/db/server";
import { can } from "@/lib/auth/permissions";
import type { GymRole, PaymentMethod } from "@/lib/db/database.types";
import type { ActionResult } from "./members";

/* ============================================================================
   Payment proof: the gym's UPI code, the member's screenshot, and approval.

   The rule the whole flow turns on: proof is not payment. A member uploading
   a screenshot records a CLAIM and nothing else — no membership extension,
   no invoice, no revenue — until a human approves it. Anything else means a
   picture buys a month, and a numbered GST invoice gets issued for money that
   never arrived, which does not undo cleanly.

   Money taken at the desk skips the queue entirely: reception watched it
   happen, so recording it is the verification.
   ========================================================================= */

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = ["image/jpeg", "image/png", "image/webp", "image/heic"];

/** Shared guard: screenshots come off a phone camera and can be enormous. */
function checkImage(file: File | null): string | null {
  if (!file || file.size === 0) return "Choose an image.";
  if (file.size > MAX_BYTES) return "That image is over 5MB. Try a screenshot rather than a photo.";
  if (!ALLOWED.includes(file.type)) return "Use a JPG, PNG or WEBP image.";
  return null;
}

/* ── the gym's UPI code ───────────────────────────────────────────────────── */

export async function saveUpiDetails(
  _prev: ActionResult | null,
  form: FormData,
): Promise<ActionResult> {
  const actor = await requireActor();
  if (!can(actor.role as GymRole, "settings", "edit")) {
    return { ok: false, error: "Only an owner can change payment settings." };
  }

  const vpa = String(form.get("upi_vpa") ?? "").trim();
  const paymentLink = String(form.get("payment_link") ?? "").trim();
  const file = form.get("qr") as File | null;
  const db = await createServerDb();

  const patch: Record<string, unknown> = {
    upi_vpa: vpa || null,
    payment_link: paymentLink || null,
  };

  /* Read the current path before overwriting it, so the old image can be
     cleared up once the new one is safely in place. */
  const { data: current } = await db
    .from("gyms")
    .select("upi_qr_path")
    .eq("id", actor.gymId)
    .maybeSingle();
  const previous = (current as { upi_qr_path: string | null } | null)?.upi_qr_path ?? null;

  if (file && file.size > 0) {
    const bad = checkImage(file);
    if (bad) return { ok: false, error: bad };

    /* Gym id first in the path: that segment is what the storage policy
       matches on, so it is the tenant boundary rather than decoration.

       A fresh name every time, rather than one fixed upi-qr.png. Replacing an
       object in place needs UPDATE on storage.objects, and that was refused —
       so the first save worked and every save after it failed, which is a
       miserable thing to debug from a screen that only says it could not
       upload. Writing a new object only ever needs INSERT.

       It also sidesteps a stale QR: the bucket is public and CDN-cached, and
       a payment code that silently serves the previous gym's image is worse
       than a few stray files. */
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "png";
    const path = `${actor.gymId}/upi-qr-${Date.now()}.${ext}`;

    const { error } = await db.storage
      .from("gym-public")
      .upload(path, file, { contentType: file.type });

    /* Say what actually went wrong. Owners are the only people who reach this
       screen, and "could not upload" gives them nothing to act on. */
    if (error) {
      return { ok: false, error: `Could not upload the QR image — ${error.message}` };
    }
    patch.upi_qr_path = path;
  }

  const { error } = await db.from("gyms").update(patch).eq("id", actor.gymId);
  if (error) return { ok: false, error: "Could not save." };

  /* Best effort, and deliberately after the row is updated: an orphaned image
     nobody points at is harmless, whereas deleting first would break the QR
     members see if the update then failed. */
  if (patch.upi_qr_path && previous && previous !== patch.upi_qr_path) {
    await db.storage.from("gym-public").remove([previous]);
  }

  revalidatePath("/admin/settings");
  revalidatePath("/m/membership");
  return { ok: true, message: "Saved. Members will see this when they pay." };
}

/* ── a member says they have paid ─────────────────────────────────────────── */

export async function submitPaymentProof(
  _prev: ActionResult | null,
  form: FormData,
): Promise<ActionResult> {
  const actor = await requireActor();
  const planId = String(form.get("plan_id") ?? "");
  const method = (String(form.get("method") ?? "upi") as PaymentMethod);
  const reference = String(form.get("reference") ?? "").trim();
  const file = form.get("proof") as File | null;

  if (!planId) return { ok: false, error: "Choose a plan." };
  const bad = checkImage(file);
  if (bad) return { ok: false, error: bad };

  const db = await createServerDb();

  const { data: me } = await db
    .from("members")
    .select("id")
    .eq("gym_id", actor.gymId)
    .eq("user_id", actor.userId)
    .maybeSingle();

  const memberId = (me as { id: string } | null)?.id;
  if (!memberId) return { ok: false, error: "Your account is not linked to a member record." };

  const ext = file!.name.split(".").pop()?.toLowerCase() ?? "jpg";
  const path = `${actor.gymId}/${memberId}/${Date.now()}.${ext}`;

  const { error: upErr } = await db.storage
    .from("payment-proofs")
    .upload(path, file!, { contentType: file!.type });
  if (upErr) return { ok: false, error: "Could not upload the screenshot. Try again." };

  const { error } = await db.rpc("claim_payment", {
    p_gym_id: actor.gymId,
    p_member_id: memberId,
    p_plan_id: planId,
    p_method: method,
    p_proof_path: path,
    p_reference: reference || null,
  });

  if (error) {
    /* Two database constraints guard this, and both are things the member
       can act on — so say which, rather than a generic failure. 23505 is a
       unique violation. */
    if (error.code === "23505") {
      return {
        ok: false,
        error: error.message.includes("payments_reference_once")
          ? "That UPI reference has already been used. Check you copied the right one from your payment."
          : "You already have a payment waiting to be checked. Ask at the desk if it is taking too long.",
      };
    }
    return { ok: false, error: "Could not record that. Ask reception." };
  }

  revalidatePath("/m/membership");
  revalidatePath("/admin/payments");
  return {
    ok: true,
    message:
      "Sent to the gym. Your membership updates once reception checks it — usually the same day.",
  };
}

/* ── reception verifies it ────────────────────────────────────────────────── */

export async function approvePayment(form: FormData): Promise<ActionResult> {
  const actor = await requireActor();
  if (!can(actor.role as GymRole, "payments", "edit")) {
    return { ok: false, error: "You do not have permission to approve payments." };
  }

  const id = String(form.get("payment_id") ?? "");
  const planId = String(form.get("plan_id") ?? "");
  if (!id || !planId) return { ok: false, error: "Choose which plan this pays for." };

  const db = await createServerDb();
  const { error } = await db.rpc("approve_payment", {
    p_payment_id: id,
    p_plan_id: planId,
  });

  if (error) {
    return {
      ok: false,
      error: error.message.includes("not awaiting")
        ? "That payment has already been dealt with."
        : "Could not approve it.",
    };
  }

  revalidatePath("/admin/payments");
  return { ok: true, message: "Approved. Membership extended and an invoice issued." };
}

export async function rejectPayment(form: FormData): Promise<ActionResult> {
  const actor = await requireActor();
  if (!can(actor.role as GymRole, "payments", "edit")) {
    return { ok: false, error: "You do not have permission to reject payments." };
  }

  const id = String(form.get("payment_id") ?? "");
  const reason = String(form.get("reason") ?? "").trim();
  if (!reason) return { ok: false, error: "Give a reason — the member sees it." };

  const db = await createServerDb();
  const { error } = await db.rpc("reject_payment", { p_payment_id: id, p_reason: reason });
  if (error) return { ok: false, error: "Could not reject it." };

  revalidatePath("/admin/payments");
  return { ok: true, message: "Rejected." };
}
