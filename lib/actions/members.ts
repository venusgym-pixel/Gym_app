"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createServerDb, requireActor } from "@/lib/db/server";
import { can } from "@/lib/auth/permissions";
import type { GymRole, PaymentMethod } from "@/lib/db/database.types";

/* ============================================================================
   Server Actions for the admin surface (ADR-2: admin and trainer use Server
   Actions freely; the member app does not, so it stays Expo-portable).

   Every action re-checks permission server-side. The UI already hides what a
   role cannot do, but hiding a button is not authorisation — and RLS, while
   the real backstop, returns a confusing empty result rather than a usable
   error. Checking here means reception gets "you cannot do that" instead of
   a silent no-op.
   ========================================================================= */

export type ActionResult =
  | { ok: true; id?: string; message?: string }
  | { ok: false; error: string };

/* ── create a member ──────────────────────────────────────────────────────── */

const NewMember = z.object({
  full_name: z.string().trim().min(2, "Name is required"),
  phone: z.string().trim().regex(/^[6-9]\d{9}$/, "Enter a 10-digit Indian mobile"),
  email: z.union([z.email(), z.literal("")]).optional(),
  date_of_birth: z.union([z.iso.date(), z.literal("")]).optional(),
  gender: z.string().optional(),
  emergency_contact_name: z.string().optional(),
  emergency_contact_phone: z.string().optional(),
  /* DPDP Rule 10 — required when the member is under 18. */
  guardian_name: z.string().optional(),
  guardian_phone: z.string().optional(),
});

function isMinor(dob: string | undefined): boolean {
  if (!dob) return false;
  const born = new Date(dob);
  if (Number.isNaN(born.getTime())) return false;
  const eighteen = new Date(born);
  eighteen.setFullYear(eighteen.getFullYear() + 18);
  return eighteen > new Date();
}

export async function createMember(form: FormData): Promise<ActionResult> {
  const actor = await requireActor();
  if (!can(actor.role as GymRole, "members", "create")) {
    return { ok: false, error: "You do not have permission to add members." };
  }

  const parsed = NewMember.safeParse(Object.fromEntries(form));
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form." };
  }
  const v = parsed.data;

  /* The gate, enforced server-side. A minor without recorded guardian consent
     must not be created at all — backfilling consent later is not possible. */
  if (isMinor(v.date_of_birth) && !(v.guardian_name?.trim() && v.guardian_phone?.trim())) {
    return {
      ok: false,
      error: "This member is under 18. A parent or guardian's name and phone are required.",
    };
  }

  const db = await createServerDb();

  /* Member codes are unique per gym. Derive the next one rather than asking
     reception to invent it — they will reuse numbers otherwise. */
  const { data: last } = await db
    .from("members")
    .select("member_code")
    .eq("gym_id", actor.gymId)
    .like("member_code", "M-%")
    .order("member_code", { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextNum =
    Number((last as { member_code: string } | null)?.member_code?.slice(2) ?? 0) + 1;
  const code = `M-${String(nextNum).padStart(3, "0")}`;

  const { data, error } = await db
    .from("members")
    .insert({
      gym_id: actor.gymId,
      member_code: code,
      full_name: v.full_name,
      phone: `+91${v.phone}`,
      email: v.email || null,
      date_of_birth: v.date_of_birth || null,
      gender: v.gender || null,
      emergency_contact_name: v.emergency_contact_name || null,
      emergency_contact_phone: v.emergency_contact_phone || null,
    })
    .select("id")
    .single();

  if (error) {
    return {
      ok: false,
      error:
        error.code === "23505"
          ? "A member with that phone number already exists."
          : "Could not save the member.",
    };
  }

  const memberId = (data as { id: string }).id;

  const consents: Record<string, unknown>[] = [
    { gym_id: actor.gymId, member_id: memberId, consent_type: "waiver",
      granted: true, recorded_by: actor.userId },
    { gym_id: actor.gymId, member_id: memberId, consent_type: "terms",
      granted: true, recorded_by: actor.userId },
  ];

  if (isMinor(v.date_of_birth)) {
    consents.push({
      gym_id: actor.gymId,
      member_id: memberId,
      consent_type: "guardian",
      granted: true,
      guardian_name: v.guardian_name!.trim(),
      guardian_phone: v.guardian_phone!.trim(),
      verification_method: "recorded_at_reception",
      recorded_by: actor.userId,
    });
  }

  await db.from("member_consents").insert(consents);

  revalidatePath("/admin/members");
  revalidatePath("/admin");
  return { ok: true, id: memberId, message: `${v.full_name} added as ${code}.` };
}

/* ── take money ───────────────────────────────────────────────────────────── */

const Payment = z.object({
  member_id: z.uuid(),
  plan_id: z.uuid(),
  method: z.enum(["cash", "upi", "card", "netbanking", "bank_transfer", "other"]),
  reference: z.string().optional(),
});

/**
 * Assign or renew a membership and take payment.
 *
 * All three effects — payment row, membership term, GST invoice — happen in
 * one database function so they cannot drift apart. A payment without a
 * membership extension locks a paying member out at the turnstile; an
 * extension without an invoice is a GST problem for the gym.
 */
export async function recordPayment(form: FormData): Promise<ActionResult> {
  const actor = await requireActor();
  if (!can(actor.role as GymRole, "payments", "create")) {
    return { ok: false, error: "You do not have permission to take payments." };
  }

  const parsed = Payment.safeParse(Object.fromEntries(form));
  if (!parsed.success) {
    return { ok: false, error: "Choose a plan and a payment method." };
  }
  const v = parsed.data;

  const db = await createServerDb();
  const { data, error } = await db.rpc("record_payment_and_extend", {
    p_gym_id: actor.gymId,
    p_member_id: v.member_id,
    p_plan_id: v.plan_id,
    p_method: v.method as PaymentMethod,
    p_reference: v.reference || null,
    p_recorded_by: actor.userId,
  });

  if (error) return { ok: false, error: "Could not record the payment." };

  const row = Array.isArray(data) ? data[0] : data;

  /* An optional photo of the receipt, or of the UPI confirmation on the
     member's phone. Attached AFTER the payment is recorded, deliberately:
     money the gym has actually taken must not fail to record because an
     image would not upload. The payment is the fact; the photo is evidence.

     Marked verified on the spot — staff were standing there, so recording it
     IS the verification. Only member-submitted claims wait in a queue. */
  const receipt = form.get("receipt") as File | null;
  if (receipt && receipt.size > 0 && row?.payment_id) {
    const ext = receipt.name.split(".").pop()?.toLowerCase() ?? "jpg";
    const path = actor.gymId + "/" + v.member_id + "/desk-" + Date.now() + "." + ext;

    const { error: upErr } = await db.storage
      .from("payment-proofs")
      .upload(path, receipt, { contentType: receipt.type });

    if (!upErr) {
      await db
        .from("payments")
        .update({
          proof_path: path,
          proof_kind: v.method === "cash" ? "cash_receipt" : "other",
          verified_by: actor.userId,
          verified_at: new Date().toISOString(),
        })
        .eq("id", row.payment_id);
    }
  }

  revalidatePath("/admin");
  revalidatePath("/admin/members");
  revalidatePath(`/admin/members/${v.member_id}`);
  revalidatePath("/admin/payments");

  return {
    ok: true,
    id: row?.invoice_id,
    message: `Paid. Membership now runs to ${row?.expires_on}.`,
  };
}

/* ── front-desk check-in (A-22) ───────────────────────────────────────────── */

export async function manualCheckIn(memberId: string): Promise<ActionResult> {
  const actor = await requireActor();
  if (!can(actor.role as GymRole, "attendance", "create")) {
    return { ok: false, error: "You do not have permission to record attendance." };
  }

  const db = await createServerDb();
  const { data, error } = await db.rpc("record_checkin", {
    p_gym_id: actor.gymId,
    p_member_id: memberId,
    p_method: "manual",
    p_recorded_by: actor.userId,
  });

  if (error) return { ok: false, error: "Could not record the check-in." };

  const row = Array.isArray(data) ? data[0] : data;
  revalidatePath("/admin/attendance");
  revalidatePath("/admin");

  /* Not-ok outcomes are returned as errors so the front desk sees why, but
     they are expected states, not faults. */
  switch (row?.outcome) {
    case "ok":
      return { ok: true, message: `${row.member_name} checked in. Streak ${row.streak}.` };
    case "duplicate":
      return { ok: true, message: `${row.member_name} already checked in.` };
    case "expired":
      return { ok: false,
        error: `${row.member_name}'s membership has expired. Renew to check in.` };
    case "frozen":
      return { ok: false, error: `${row.member_name}'s membership is frozen.` };
    default:
      return { ok: false, error: "No membership on file for that member." };
  }
}
