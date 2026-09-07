"use client";

import { useActionState, useState } from "react";
import jsQR from "jsqr";
import { vpaFromUpiPayload } from "@/lib/upi";
import { saveUpiDetails } from "@/lib/actions/payment-proof";
import { Feedback, Field, Input, Submit, FilePicker } from "@/components/admin/forms";

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
  paymentLink,
}: {
  qrUrl: string | null;
  vpa: string | null;
  paymentLink: string | null;
}) {
  const [state, action] = useActionState(saveUpiDetails, null);
  const [preview, setPreview] = useState<string | null>(null);
  const [id, setId] = useState(vpa ?? "");
  const [read, setRead] = useState<string | null>(null);

  /* Read the UPI id straight out of the code being uploaded.

     Every UPI QR is a upi://pay?pa=… string, so the sheet already taped to
     the counter carries the exact id this form asks for — and finding it
     otherwise means digging through GPay's settings for a string most owners
     have never needed. Decoded in the browser: the image is in memory here
     already, and this is a hint, not a decision the server should make. */
  async function readCode(file: File) {
    setRead(null);
    try {
      const bitmap = await createImageBitmap(file);
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(bitmap, 0, 0);
      const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);

      const found = jsQR(data, width, height);
      if (!found) {
        setRead("Could not read a code in that image — type the UPI ID below.");
        return;
      }
      const parsed = vpaFromUpiPayload(found.data);
      if (!parsed) {
        setRead("That code is not a UPI payment code — type the UPI ID below.");
        return;
      }
      setId(parsed);
      setRead(`Read ${parsed} from the code.`);
    } catch {
      setRead("Could not read that image — type the UPI ID below.");
    }
  }

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
        <FilePicker
          name="qr"
          accept="image/*"
          hint="No image chosen"
          onPick={(f) => {
            setPreview(f ? URL.createObjectURL(f) : null);
            if (f) void readCode(f);
          }}
        />
      </Field>

      <Field
        label="UPI ID"
        hint="Also builds the 'Pay in your UPI app' button, with the plan's amount already filled in."
      >
        <Input name="upi_vpa" value={id} onChange={(e) => setId(e.target.value)}
               placeholder="venusgym@okhdfcbank" className="font-mono" />
        {read && (
          <p className="mt-1 text-[11.5px] text-neutral-700">{read}</p>
        )}
      </Field>

      <Field
        label="Payment page link"
        hint="Optional. A Razorpay or BharatPe page, if you already use one. Members see it as a second option — it cannot carry the amount, so the UPI button comes first."
      >
        <Input name="payment_link" defaultValue={paymentLink ?? ""} type="url"
               placeholder="https://rzp.io/l/your-page" />
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
