"use client";

import { useActionState } from "react";
import { saveGymSettings } from "@/lib/actions/settings";
import { Feedback, Field, Input, Select, Submit } from "@/components/admin/forms";

/* Uncontrolled inputs with defaultValue: this form is edited once every few
   months, so per-keystroke state would buy nothing. */

export function GymSettingsForm({
  gym,
}: {
  gym: {
    name: string;
    address: string | null;
    phone: string | null;
    email: string | null;
    gstin: string | null;
    reminder_hour: number;
  };
}) {
  const [state, action] = useActionState(saveGymSettings, null);

  return (
    <form action={action} className="space-y-4">
      <Field label="Gym name" required>
        <Input name="name" defaultValue={gym.name} required />
      </Field>

      <Field label="Address" hint="Printed on every invoice.">
        <Input name="address" defaultValue={gym.address ?? ""} />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Phone">
          <Input name="phone" defaultValue={gym.phone ?? ""} inputMode="tel" />
        </Field>
        <Field label="Email">
          <Input name="email" type="email" defaultValue={gym.email ?? ""} />
        </Field>
      </div>

      <Field
        label="GSTIN"
        hint="Invoices carry a non-compliance warning until this is set. 15 characters, e.g. 29ABCDE1234F1Z5."
      >
        <Input
          name="gstin"
          defaultValue={gym.gstin ?? ""}
          maxLength={15}
          className="font-mono uppercase"
          placeholder="29ABCDE1234F1Z5"
        />
      </Field>

      <Field
        label="Reminder hour"
        hint="When the daily job sends renewal reminders. Local time."
      >
        <Select name="reminder_hour" defaultValue={String(gym.reminder_hour)}>
          {Array.from({ length: 24 }, (_, h) => (
            <option key={h} value={h}>
              {String(h).padStart(2, "0")}:00
            </option>
          ))}
        </Select>
      </Field>

      <Feedback state={state} />
      <Submit>Save changes</Submit>
    </form>
  );
}
