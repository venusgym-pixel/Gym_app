"use client";

import { useActionState, useState } from "react";
import { saveUpiDetails } from "@/lib/actions/payment-proof";
import { Feedback, Field, Input, Submit } from "@/components/admin/forms";

/* ============================================================================
   A-44 · The UPI code members pay to.

   Deliberately an image upload rather than generating a UPI intent QR from a
   VPA. The gym already has a printed code taped to the counter that their
   bank issued and that they trust; a generated one would look different,
   which is exactly the moment a member stops and asks whether the app is
   real.

   The VPA is captured too, as text under the code, because some members type
   it and a QR that will not scan should not be the end of the road.
   ========================================================================= */

export function UpiSetup({
  qrUrl,
  vpa,
}: {
  qrUrl: string | null;
  vpa: string | null;
}) {
  const [state, action] = useActionState(saveUpiDetails, null);
  const [preview, setPreview] = useState<string | null>(null);

  return (
    <form action={action} className="space-y-4">
      {(preview || qrUrl) && (
        <div className="text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={preview ?? qrUrl!}
            alt="UPI QR code"
            className="mx-auto w-[170px] rounded-md border border-neutral-300 bg-white p-2"
          />
          <p className="mt-1.5 text-[11.5px] text-neutral-600">
            {preview ? "New code — save to apply" : "What members see now"}
          </p>
        </div>
      )}

      <Field
        label={qrUrl ? "Replace the QR image" : "UPI QR image"}
        hint="A photo or screenshot of the code from your bank or payment app. Under 5MB."
      >
        <input
          type="file"
          name="qr"
          accept="image/*"
          onChange={(e) => {
            const f = e.target.files?.[0];
            setPreview(f ? URL.createObjectURL(f) : null);
          }}
          className="w-full text-[13px]"
        />
      </Field>

      <Field label="UPI ID" hint="Shown as text under the code, for members who type it.">
        <Input name="upi_vpa" defaultValue={vpa ?? ""} placeholder="venusgym@okhdfcbank"
               className="font-mono" />
      </Field>

      <Feedback state={state} />
      <Submit>Save payment details</Submit>

      <p className="text-[11.5px] text-neutral-600">
        Members pay in their own UPI app and send a screenshot. Nothing changes
        on their membership until someone here approves it on the Payments
        screen — the screenshot is a claim, not a payment.
      </p>
    </form>
  );
}
