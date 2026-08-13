"use client";

import { useActionState, useState, useTransition } from "react";
import { changeStaffRole, inviteStaff, setStaffAccess } from "@/lib/actions/staff";
import { Feedback, Field, Input, Select, Submit } from "@/components/admin/forms";
import type { GymRole } from "@/lib/db/database.types";

const ROLES: GymRole[] = ["manager", "trainer", "receptionist", "nutritionist"];

export function InviteStaff() {
  const [state, action] = useActionState(inviteStaff, null);

  return (
    <form action={action} className="space-y-4">
      <Field label="Full name" required>
        <Input name="full_name" required placeholder="Anita Desai" />
      </Field>
      <Field label="Email" required hint="This becomes their sign-in.">
        <Input name="email" type="email" required placeholder="anita@gym.in" />
      </Field>
      <Field label="Phone">
        <Input name="phone" inputMode="tel" placeholder="9845012345" />
      </Field>
      <Field label="Role" required>
        <Select name="role" defaultValue="receptionist" required>
          {ROLES.map((r) => (
            <option key={r} value={r} className="capitalize">{r}</option>
          ))}
        </Select>
      </Field>

      <Feedback state={state} />
      <Submit>Add to the team</Submit>

      <p className="text-[11.5px] text-neutral-600">
        No invite email is sent. You get a one-time password to hand over —
        they change it at first sign-in.
      </p>
    </form>
  );
}

/* Row-level controls. Kept client-side so a role change is one interaction
   rather than a navigate-edit-save round trip; the server action re-checks
   permission regardless. */
export function StaffRow({
  userId, name, email, role, isSelf, canEdit, revoked,
}: {
  userId: string;
  name: string;
  email: string | null;
  role: GymRole;
  isSelf: boolean;
  canEdit: boolean;
  revoked: boolean;
}) {
  const [pending, start] = useTransition();
  const [note, setNote] = useState<string | null>(null);

  function run(fn: () => Promise<{ ok: boolean; message?: string; error?: string }>) {
    start(async () => {
      const r = await fn();
      setNote(r.ok ? (r.message ?? "Saved.") : (r.error ?? "Failed."));
    });
  }

  /* Owners are not editable from here: demoting the last owner would leave
     the gym with nobody who can reach Settings. Transfer is a support job.

     Any role outside ROLES is locked too. A <select> whose defaultValue is
     absent from its options silently displays the FIRST option instead — so
     a role this dropdown cannot represent would be shown as the wrong one,
     which is worse than showing it as read-only. */
  const locked = !canEdit || isSelf || !ROLES.includes(role);

  return (
    <li className="py-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13.5px] font-medium">
            {name}
            {isSelf && <span className="ml-2 text-[11px] text-neutral-600">you</span>}
          </div>
          {email && <div className="truncate text-[11.5px] text-neutral-600">{email}</div>}
        </div>

        {locked ? (
          <span className="rounded-pill bg-neutral-200 px-2.5 py-0.5 text-[11px] font-semibold text-neutral-700 capitalize">
            {role}
          </span>
        ) : (
          <select
            defaultValue={role}
            disabled={pending}
            onChange={(e) => {
              const form = new FormData();
              form.set("user_id", userId);
              form.set("role", e.target.value);
              run(() => changeStaffRole(form));
            }}
            className="rounded-md border border-neutral-300 bg-bg px-2 py-1 text-[12.5px] capitalize"
          >
            {ROLES.map((r) => (
              <option key={r} value={r} className="capitalize">{r}</option>
            ))}
          </select>
        )}

        {canEdit && !isSelf && ROLES.includes(role) && (
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              const form = new FormData();
              form.set("user_id", userId);
              form.set("revoke", revoked ? "0" : "1");
              run(() => setStaffAccess(form));
            }}
            className="rounded-pill border border-neutral-300 px-3 py-1 text-[12px] font-semibold text-neutral-800 hover:bg-neutral-200 disabled:opacity-50"
          >
            {revoked ? "Restore" : "Revoke"}
          </button>
        )}
      </div>

      {note && <p role="status" className="mt-2 text-[11.5px] text-neutral-700">{note}</p>}
    </li>
  );
}
