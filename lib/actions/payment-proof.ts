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
  const file = form.get("qr") as File | null;
  const db = await createServerDb();

  const patch: Record<string, unknown> = { upi_vpa: vpa || null };

  if (file && file.size > 0) {
    const bad = checkImage(file);
    if (bad) return { ok: false, error: bad };

    /* Gym id first in the path: that segment is what the storage policy
       matches on, so it is the tenant boundary rather than decoration. */
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "png";
    const path = `${actor.gymId}/upi-qr.${ext}`;

    const { error } = await db.storage
      .from("gym-public")
      .upload(path, file, { upsert: true, contentType: file.type });

    if (error) return { ok: false, error: "Could not upload the QR image." };
    patch.upi_qr_path = path;
  }

  const { error } = await db.from("gyms").update(patch).eq("id", actor.gymId);
  if (error) return { ok: false, error: "Could not save." };

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

  if (error) return { ok: false, error: "Could not record that. Ask reception." };

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

/**
 * A short-lived link to a proof image.
 *
 * The bucket is private, so there is no permanent URL to store — and that is
 * deliberate: a payment screenshot carries a member's name, the amount and
 * usually their bank.
 */
export async function proofUrl(path: string): Promise<string | null> {
  const actor = await requireActor();
  if (!can(actor.role as GymRole, "payments", "view")) return null;

  const db = await createServerDb();
  const { data } = await db.storage.from("payment-proofs").createSignedUrl(path, 300);
  return data?.signedUrl ?? null;
}
