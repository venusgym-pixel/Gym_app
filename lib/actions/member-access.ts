"use server";

import { revalidatePath } from "next/cache";
import { createServerDb, requireActor } from "@/lib/db/server";
import { withGymScope } from "@/lib/db/admin";
import { can } from "@/lib/auth/permissions";
import {
  authEmailForPhone,
  canonicalCode,
  formatCode,
  hashCode,
  newClaimCode,
  newRecoveryCode,
  normalisePhone,
} from "@/lib/auth/member-identity";
import type { GymRole } from "@/lib/db/database.types";
import type { ActionResult } from "./members";

/* ============================================================================
   Turning a member into an app login, without email or SMS.

   Reception issues a short code at the counter; the member scans it and picks
   a password. From then on they sign in with phone + password and can reset
   themselves with a recovery code. The desk is involved exactly once.

   The lookups run as definer functions in SQL rather than as service-role
   queries here, because a claim code is matched across every gym — the code
   is all we have, the tenant is what we are looking for. withGymScope() is
   used only once the gym is actually known, for the one step SQL cannot do:
   creating the auth.users row.
   ========================================================================= */

const CLAIM_TTL_HOURS = 24;

/* ── 1 · the desk issues a code ───────────────────────────────────────────── */

export async function issueClaimCode(memberId: string): Promise<ActionResult> {
  const actor = await requireActor();
  if (!can(actor.role as GymRole, "members", "edit")) {
    return { ok: false, error: "You do not have permission to set up app access." };
  }

  const db = await createServerDb();
  const code = newClaimCode();

  /* Any earlier unused code stops working. Two live codes for one member
     means the one reception is reading aloud might not be the one that
     works, which is impossible to debug from behind the counter. */
  await db
    .from("member_claim_codes")
    .update({ used_at: new Date().toISOString() })
    .eq("gym_id", actor.gymId)
    .eq("member_id", memberId)
    .is("used_at", null);

  const { error } = await db.from("member_claim_codes").insert({
    gym_id: actor.gymId,
    member_id: memberId,
    code_hash: await hashCode(code),
    expires_at: new Date(Date.now() + CLAIM_TTL_HOURS * 3600_000).toISOString(),
    created_by: actor.userId,
  });

  if (error) return { ok: false, error: "Could not create a code. Try again." };

  revalidatePath(`/admin/members/${memberId}`);
  /* Returned once, to be shown on the counter screen. Only the digest is
     stored, so this is the only moment it exists in readable form. */
  return { ok: true, message: code };
}

/* ── 2 · the member claims it ─────────────────────────────────────────────── */

export interface ClaimTarget {
  fullName: string;
  gymName: string;
  maskedPhone: string;
}

/** What /join shows before the member has proved anything. */
export async function lookupClaimCode(code: string): Promise<ClaimTarget | null> {
  const db = await createServerDb();
  const { data } = await db.rpc("claim_code_peek", { p_hash: await hashCode(code) });

  const row = (data as unknown as
    | { full_name: string; gym_name: string; masked_phone: string }[]
    | null)?.[0];

  return row
    ? { fullName: row.full_name, gymName: row.gym_name, maskedPhone: row.masked_phone }
    : null;
}

export interface ClaimResult {
  ok: boolean;
  error?: string;
  /** Shown once, then only its digest is kept. */
  recoveryCode?: string;
}

export async function claimAccount(
  _prev: ClaimResult | null,
  form: FormData,
): Promise<ClaimResult> {
  const code = canonicalCode(String(form.get("code") ?? ""));
  const last4 = String(form.get("last4") ?? "").replace(/\D/g, "");
  const password = String(form.get("password") ?? "");

  if (password.length < 8) return { ok: false, error: "Use at least 8 characters." };

  const hash = await hashCode(code);
  const db = await createServerDb();

  const { data } = await db.rpc("claim_code_verify", { p_hash: hash, p_last4: last4 });
  const target = (data as unknown as
    | { member_id: string; gym_id: string; user_id: string | null; phone: string; full_name: string }[]
    | null)?.[0];

  if (!target) {
    /* One message for an expired code and wrong digits alike: distinguishing
       them would turn the form into an oracle for whether a code is live. */
    return { ok: false, error: "That code or those digits are not right. Check with reception." };
  }

  const email = authEmailForPhone(target.phone);
  const recovery = newRecoveryCode();

  /* The gym is known now, so the privileged step can name its tenant. Only
     the auth.users write needs it — RLS governs the public schema, not
     Supabase Auth, so there is no SQL equivalent. */
  const auth = await withGymScope("member-claim", target.gym_id, async (adminDb) => {
    if (target.user_id) {
      /* Re-claiming an existing account — lost password, new phone. The SAME
         auth user is reused: a second one would silently orphan their streak,
         workouts and check-in history. */
      const { error } = await adminDb.auth.admin.updateUserById(target.user_id, { password });
      return error ? { ok: false as const, error: "Could not reset the account." }
                   : { ok: true as const, userId: target.user_id };
    }

    const created = await adminDb.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (created.data.user) {
      await adminDb.from("profiles").upsert({
        id: created.data.user.id,
        full_name: target.full_name,
        phone: target.phone,
      });
      return { ok: true as const, userId: created.data.user.id };
    }

    /* An auth user already exists for this number — re-added after deletion,
       or a member of another gym on the platform. Adopt it. */
    const { data: list } = await adminDb.auth.admin.listUsers();
    const found = list.users.find((u) => u.email?.toLowerCase() === email);
    if (!found) {
      return { ok: false as const, error: created.error?.message ?? "Could not create the account." };
    }
    await adminDb.auth.admin.updateUserById(found.id, { password });
    return { ok: true as const, userId: found.id };
  });

  if (!auth.ok) return { ok: false, error: auth.error };

  const { error: linkError } = await db.rpc("claim_code_complete", {
    p_hash: hash,
    p_member_id: target.member_id,
    p_user_id: auth.userId,
    p_recovery_hash: await hashCode(recovery),
  });
  if (linkError) return { ok: false, error: "Could not finish setting up the account." };

  /* Sign them in here, so they land in the app rather than on a login screen
     holding a password they chose ten seconds ago. */
  const { error } = await db.auth.signInWithPassword({ email, password });
  if (error) {
    return { ok: false, error: "Account created, but sign-in failed. Use the login screen." };
  }

  return { ok: true, recoveryCode: formatCode(recovery) };
}

/* ── 3 · the member resets themselves ─────────────────────────────────────── */

export async function resetWithRecoveryCode(
  _prev: ClaimResult | null,
  form: FormData,
): Promise<ClaimResult> {
  const phone = normalisePhone(String(form.get("phone") ?? ""));
  const code = canonicalCode(String(form.get("code") ?? ""));
  const password = String(form.get("password") ?? "");

  if (!phone) return { ok: false, error: "Enter your 10-digit mobile number." };
  if (password.length < 8) return { ok: false, error: "Use at least 8 characters." };

  const db = await createServerDb();
  const { data } = await db.rpc("recovery_lookup", {
    p_phone: phone,
    p_hash: await hashCode(code),
  });

  const found = (data as unknown as
    | { member_id: string; gym_id: string; user_id: string }[]
    | null)?.[0];

  /* One message for a wrong number and a wrong code alike — telling them
     apart would confirm which numbers belong to members. */
  if (!found) return { ok: false, error: "That number and code do not match." };

  const fresh = newRecoveryCode();

  const reset = await withGymScope("member-claim", found.gym_id, async (adminDb) => {
    const { error } = await adminDb.auth.admin.updateUserById(found.user_id, { password });
    return error ? { ok: false as const } : { ok: true as const };
  });

  if (!reset.ok) return { ok: false, error: "Could not reset the password." };

  // Spent. A new one is issued so they are never left without a way back.
  await db.rpc("recovery_rotate", {
    p_member_id: found.member_id,
    p_new_hash: await hashCode(fresh),
  });

  const { error } = await db.auth.signInWithPassword({
    email: authEmailForPhone(phone),
    password,
  });
  if (error) return { ok: false, error: "Password changed. Sign in with your new one." };

  return { ok: true, recoveryCode: formatCode(fresh) };
}
