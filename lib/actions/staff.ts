"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createServerDb, requireActor } from "@/lib/db/server";
import { withGymScope } from "@/lib/db/admin";
import { can } from "@/lib/auth/permissions";
import type { GymRole } from "@/lib/db/database.types";
import type { ActionResult } from "./members";

/* ============================================================================
   A-38 · Staff.

   Inviting someone creates a row in auth.users, and no RLS policy can reach
   that: row-level security governs the public schema, while Supabase Auth
   lives behind its own admin API. So this is one of the sanctioned bypasses
   in lib/db/admin.ts — narrowly, and only after the caller's permission has
   been checked here first.

   Delivery is deliberately out of band. Supabase's invite email needs SMTP
   configured, which most gyms will not have on day one, so the action returns
   a one-time password for the owner to hand over. The new user is pushed to
   /set-password at first sign-in.
   ========================================================================= */

const ROLES = ["manager", "trainer", "receptionist", "nutritionist"] as const;

const Invite = z.object({
  full_name: z.string().trim().min(2, "Name is required"),
  email: z.email("Enter a valid email"),
  phone: z.string().trim().optional(),
  role: z.enum(ROLES, { message: "Choose a role" }),
});

export async function inviteStaff(
  _prev: ActionResult | null,
  form: FormData,
): Promise<ActionResult> {
  const actor = await requireActor();
  if (!can(actor.role as GymRole, "staff", "create")) {
    return { ok: false, error: "You do not have permission to add staff." };
  }

  const parsed = Invite.safeParse(Object.fromEntries(form));
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form." };
  }
  const v = parsed.data;

  /* A second owner can only be made by an owner, and not through this form at
     all — ownership transfer should be a deliberate, logged act, not a dropdown
     choice made while adding a receptionist. */
  const tempPassword = "fitwell-" + crypto.randomUUID().slice(0, 10);

  try {
    return await withGymScope("staff-invite", actor.gymId, async (db, gymId) => {
      let userId: string;

      const created = await db.auth.admin.createUser({
        email: v.email,
        password: tempPassword,
        email_confirm: true,
      });

      if (created.data.user) {
        userId = created.data.user.id;
      } else {
        /* Already has an account — quite normal: a trainer who is also a
           member, or someone re-invited after being revoked. Link the existing
           user instead of failing, but do not reset their password. */
        const { data: list } = await db.auth.admin.listUsers();
        const found = list.users.find(
          (u) => u.email?.toLowerCase() === v.email.toLowerCase(),
        );
        if (!found) {
          return { ok: false as const, error: created.error?.message ?? "Could not create the account." };
        }
        userId = found.id;

        const { error } = await db.from("gym_users").upsert(
          { gym_id: gymId, user_id: userId, role: v.role, is_active: true, revoked_at: null },
          { onConflict: "gym_id,user_id" },
        );
        if (error) return { ok: false as const, error: "Could not link that account." };

        revalidatePath("/admin/staff");
        return {
          ok: true as const,
          message: `${v.email} already had an account — added as ${v.role} with their existing password.`,
        };
      }

      await db.from("profiles").upsert({
        id: userId,
        full_name: v.full_name,
        email: v.email,
        phone: v.phone || null,
      });

      const { error } = await db.from("gym_users").upsert(
        { gym_id: gymId, user_id: userId, role: v.role, is_active: true },
        { onConflict: "gym_id,user_id" },
      );
      if (error) return { ok: false as const, error: "Account created but not linked to the gym." };

      revalidatePath("/admin/staff");
      return {
        ok: true as const,
        message:
          `${v.full_name} added as ${v.role}. Sign-in: ${v.email} · ${tempPassword} — ` +
          `give them this once; they will be asked to change it.`,
      };
    });
  } catch {
    return { ok: false, error: "Could not invite that person. Try again." };
  }
}

/* ── role changes and revocation ──────────────────────────────────────────── */

const Change = z.object({
  user_id: z.uuid(),
  role: z.enum(ROLES),
});

export async function changeStaffRole(form: FormData): Promise<ActionResult> {
  const actor = await requireActor();
  if (!can(actor.role as GymRole, "staff", "edit")) {
    return { ok: false, error: "You do not have permission to change roles." };
  }

  const parsed = Change.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { ok: false, error: "Choose a role." };

  /* Nobody may demote themselves: an owner who picks "receptionist" by
     mistake locks the gym out of its own settings with no way back. */
  if (parsed.data.user_id === actor.userId) {
    return { ok: false, error: "You cannot change your own role." };
  }

  const db = await createServerDb();
  const { error } = await db
    .from("gym_users")
    .update({ role: parsed.data.role })
    .eq("gym_id", actor.gymId)
    .eq("user_id", parsed.data.user_id);

  if (error) return { ok: false, error: "Could not change the role." };

  revalidatePath("/admin/staff");
  return { ok: true, message: "Role updated. It applies when their session next refreshes." };
}

export async function setStaffAccess(form: FormData): Promise<ActionResult> {
  const actor = await requireActor();
  if (!can(actor.role as GymRole, "staff", "edit")) {
    return { ok: false, error: "You do not have permission to change access." };
  }

  const userId = String(form.get("user_id") ?? "");
  const revoke = String(form.get("revoke") ?? "") === "1";

  if (userId === actor.userId) {
    return { ok: false, error: "You cannot revoke your own access." };
  }

  const db = await createServerDb();
  const { error } = await db
    .from("gym_users")
    .update({
      is_active: !revoke,
      /* auth_gym_id() checks revoked_at, so this is what actually ends access
         — at their next token refresh, not at the next page load. */
      revoked_at: revoke ? new Date().toISOString() : null,
    })
    .eq("gym_id", actor.gymId)
    .eq("user_id", userId);

  if (error) return { ok: false, error: "Could not update access." };

  revalidatePath("/admin/staff");
  return {
    ok: true,
    message: revoke
      ? "Access revoked. Their current session ends within the hour."
      : "Access restored.",
  };
}
