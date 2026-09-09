"use client";

import { useActionState, useState } from "react";
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
    gst_enabled: boolean;
    reminder_hour: number;
  };
}) {
  const [state, action] = useActionState(saveGymSettings, null);

  /* The only controlled field here, because the GSTIN below it stops being
     relevant the moment this is unticked and saying so in place beats leaving
     a field that now does nothing.

     It also has to follow the server. A plain useState seeds once and then
     keeps whatever was last clicked, so a save that did not land leaves the
     box unticked over a database that still says yes — the screen showing one
     answer while every price on the product shows the other. Re-seeding
     whenever the saved value changes means this box always reports what is
     actually stored. */
  const [gst, setGst] = useState(gym.gst_enabled);
  const [savedGst, setSavedGst] = useState(gym.gst_enabled);
  if (savedGst !== gym.gst_enabled) {
    setSavedGst(gym.gst_enabled);
    setGst(gym.gst_enabled);
  }

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

      <fieldset className="rounded-lg border border-neutral-200 p-4">
        <legend className="px-1 text-[12px] font-semibold text-neutral-700">Tax</legend>

        <label className="flex items-start gap-2.5">
          <input
            type="checkbox"
            name="gst_enabled"
            checked={gst}
            onChange={(e) => setGst(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0"
          />
          <span>
            <span className="block text-[13px] font-medium">Charge GST on memberships</span>
            <span className="block text-[11.5px] text-neutral-600">
              18% is added to every plan price at the desk, in the member app and
              on the invoice. Turn it off if the gym is not registered for GST —
              registration is only compulsory above ₹20 lakh of turnover, and
              collecting the tax without a GSTIN is not allowed.
            </span>
          </span>
        </label>

        <p className="mt-3 text-[11.5px] text-neutral-600">
          {gst
            ? "Plan prices are entered without tax; members are quoted the price with tax."
            : "Plan prices are the final price. Invoices are still numbered and issued, with no tax lines on them."}
        </p>

        <div className="mt-4">
          <Field
            label="GSTIN"
            hint={
              gst
                ? "Invoices carry a non-compliance warning until this is set. 15 characters, e.g. 29ABCDE1234F1Z5."
                : "Not needed while GST is off. Kept in case the gym registers later."
            }
          >
            <Input
              name="gstin"
              defaultValue={gym.gstin ?? ""}
              maxLength={15}
              className="font-mono uppercase"
              placeholder="29ABCDE1234F1Z5"
            />
          </Field>
        </div>
      </fieldset>

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
