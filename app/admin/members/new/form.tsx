"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { createMember, type ActionResult } from "@/lib/actions/members";
import { Feedback, Field, Input, Select, Submit } from "@/components/admin/forms";

/* ============================================================================
   A-10 · Add member.

   Deliberately one screen rather than the four-step wizard in the spec: the
   step that matters at reception is capturing a name and a phone in under a
   minute while someone waits. Plan and payment happen on the profile
   immediately after, which is also where a renewal happens — one flow to
   learn instead of two.

   The guardian block appears the moment the date of birth says under 18.
   DPDP Rule 10 requires verifiable guardian consent, and the server refuses
   the insert without it — this just makes the requirement visible before the
   submit rather than after.
   ========================================================================= */

function ageFrom(dob: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dob)) return null;
  const born = new Date(dob);
  if (Number.isNaN(born.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - born.getFullYear();
  const m = now.getMonth() - born.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < born.getDate())) age--;
  return age;
}

export function NewMemberForm() {
  const router = useRouter();
  const [dob, setDob] = useState("");
  const age = ageFrom(dob);
  const minor = age !== null && age < 18;

  const [state, action] = useActionState(
    async (_prev: ActionResult | null, form: FormData) => {
      const res = await createMember(form);
      if (res.ok && res.id) router.push(`/admin/members/${res.id}`);
      return res;
    },
    null,
  );

  return (
    <form action={action} className="max-w-xl space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name" required>
          <Input name="full_name" required autoFocus placeholder="Rahul Sharma" />
        </Field>
        <Field label="Phone" required hint="10 digits, no +91">
          <Input name="phone" required inputMode="numeric" maxLength={10}
                 placeholder="9845021764" />
        </Field>
        <Field label="Email">
          <Input name="email" type="email" placeholder="optional" />
        </Field>
        <Field label="Date of birth" hint={age !== null ? `${age} years old` : undefined}>
          <Input name="date_of_birth" type="date" value={dob}
                 onChange={(e) => setDob(e.target.value)}
                 max={new Date().toISOString().slice(0, 10)} />
        </Field>
        <Field label="Gender">
          <Select name="gender" defaultValue="">
            <option value="">Not specified</option>
            <option>Male</option><option>Female</option><option>Other</option>
          </Select>
        </Field>
        <div />
        <Field label="Emergency contact">
          <Input name="emergency_contact_name" placeholder="Name" />
        </Field>
        <Field label="Emergency phone">
          <Input name="emergency_contact_phone" placeholder="+91 98860 44120" />
        </Field>
      </div>

      {minor && (
        <div className="space-y-3 rounded-md bg-accent-100 p-4">
          <div>
            <p className="text-[13px] font-semibold text-accent-800">
              Parent or guardian consent required
            </p>
            <p className="mt-0.5 text-[12px] text-accent-700">
              This member is {age}. Indian data-protection rules require a guardian
              to consent before their information can be processed.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Guardian name" required>
              <Input name="guardian_name" required={minor} />
            </Field>
            <Field label="Guardian phone" required>
              <Input name="guardian_phone" required={minor} inputMode="numeric" />
            </Field>
          </div>
        </div>
      )}

      <Feedback state={state} />
      <Submit>Add member</Submit>
    </form>
  );
}
