"use client";

import { useActionState, useState } from "react";
import { submitPaymentProof } from "@/lib/actions/payment-proof";
import { Cta, ErrorNote, Hint, Label } from "@/components/ui/primitives";
import { formatINR } from "@/lib/money";
import type { ActionResult } from "@/lib/actions/members";

/* ============================================================================
   M-05 · Pay, with no payment gateway.

   Three steps, in the order they physically happen: pick what you are paying
   for, pay it in your own UPI app, then show the gym you did.

   The screenshot is a CLAIM, not a payment — the copy says so plainly, because
   a member who thinks they are done and finds themselves locked out at the
   door tomorrow will blame the app, and rightly. Reception approves against
   their bank, and only then does anything change.
   ========================================================================= */

interface Plan {
  id: string;
  name: string;
  price_paise: string;
  duration_days: number;
}

export function PayFlow({
  plans,
  upiQrUrl,
  upiVpa,
  lastClaim,
}: {
  plans: Plan[];
  upiQrUrl: string | null;
  upiVpa: string | null;
  /**
   * The member's most recent claim, whichever way it went.
   *
   * Waiting: do not invite a second screenshot, or reception ends up
   * approving the same money twice. Rejected: say so, with the reason —
   * dropping it silently puts them back at the pay form wondering why
   * nothing happened, and they find out at the door.
   */
  lastClaim: {
    amountPaise: string;
    createdAt: string;
    status: string;
    rejectedReason: string | null;
  } | null;
}) {
  const [state, action] = useActionState<ActionResult | null, FormData>(
    submitPaymentProof,
    null,
  );
  const [planId, setPlanId] = useState(plans[0]?.id ?? "");
  const [fileName, setFileName] = useState<string | null>(null);

  if (lastClaim?.status === "awaiting_verification") {
    return (
      <div className="rounded-lg px-5 py-4" style={{ background: "var(--color-app-surface)" }}>
        <p className="text-[0.888em] font-semibold text-app-accent">
          Waiting for the gym to check it
        </p>
        <p className="mt-1.5 text-[0.822em]" style={{ color: "var(--app-ink-55)" }}>
          You sent {formatINR(lastClaim.amountPaise)} on{" "}
          {new Date(lastClaim.createdAt).toLocaleDateString("en-IN")}. Your
          membership updates as soon as reception confirms it — usually the
          same day. Ask at the desk if it is urgent.
        </p>
      </div>
    );
  }

  if (state?.ok) {
    return (
      <div className="rounded-lg px-5 py-4" style={{ background: "var(--color-app-surface)" }}>
        <p className="text-[0.888em] font-semibold text-app-good">Sent to the gym</p>
        <p className="mt-1.5 text-[0.822em]" style={{ color: "var(--app-ink-55)" }}>
          {state.message}
        </p>
      </div>
    );
  }

  const plan = plans.find((p) => p.id === planId);

  const rejected = lastClaim?.status === "failed" ? lastClaim : null;

  return (
    <form action={action} className="space-y-5">
      {rejected && (
        <div
          className="rounded-lg px-4 py-3"
          style={{ background: "rgb(246 160 107 / 0.12)" }}
        >
          <p className="text-[0.855em] font-semibold text-app-accent">
            That payment was not accepted
          </p>
          <p className="mt-1 text-[0.789em]" style={{ color: "var(--app-ink-55)" }}>
            {rejected.rejectedReason ?? "The gym could not match it to a payment."}{" "}
            Send it again below, or ask at the front desk.
          </p>
        </div>
      )}
      {/* 1 · what */}
      <div>
        <Label>What are you paying for?</Label>
        <div className="mt-1 space-y-2">
          {plans.map((p) => (
            <label
              key={p.id}
              className="flex items-center gap-3 rounded-lg px-4 py-3"
              style={{
                background: "var(--color-app-surface)",
                border:
                  planId === p.id
                    ? "1px solid var(--color-app-accent)"
                    : "1px solid transparent",
              }}
            >
              <input
                type="radio"
                name="plan_id"
                value={p.id}
                checked={planId === p.id}
                onChange={() => setPlanId(p.id)}
                className="h-4 w-4 accent-[var(--color-app-accent)]"
              />
              <span className="flex-1 text-[0.921em] font-semibold">{p.name}</span>
              <span className="text-[0.921em] font-bold text-app-accent">
                {formatINR(p.price_paise)}
              </span>
            </label>
          ))}
        </div>
      </div>

      {/* 2 · pay */}
      {upiQrUrl || upiVpa ? (
        <div
          className="rounded-lg px-5 py-4 text-center"
          style={{ background: "var(--color-app-surface)" }}
        >
          <p className="text-[0.789em] tracking-[0.08em] uppercase"
             style={{ color: "var(--app-ink-55)" }}>
            Pay {plan ? formatINR(plan.price_paise) : ""} to
          </p>

          {upiQrUrl && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={upiQrUrl}
              alt="Gym UPI QR code"
              className="mx-auto mt-3 w-[200px] rounded-md bg-white p-2"
            />
          )}

          {upiVpa && (
            <p className="mt-3 font-mono text-[0.921em] font-semibold">{upiVpa}</p>
          )}

          <p className="mt-2 text-[0.757em]" style={{ color: "var(--app-ink-45)" }}>
            Screenshot the QR, or open your UPI app and scan it from there.
          </p>
        </div>
      ) : (
        <div className="rounded-lg px-5 py-4" style={{ background: "var(--color-app-surface)" }}>
          <p className="text-[0.822em]" style={{ color: "var(--app-ink-55)" }}>
            This gym has not added UPI details yet. Pay at the front desk.
          </p>
        </div>
      )}

      {/* 3 · prove it */}
      <div>
        <Label>Then send the screenshot</Label>
        <label
          className="mt-1 flex cursor-pointer items-center justify-center rounded-lg px-4 py-6 text-center"
          style={{
            background: "var(--color-app-surface)",
            border: "1px dashed var(--app-border)",
          }}
        >
          <input
            type="file"
            name="proof"
            accept="image/*"
            required
            className="hidden"
            onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
          />
          <span className="text-[0.855em]" style={{ color: "var(--app-ink-55)" }}>
            {fileName ?? "Tap to choose the payment screenshot"}
          </span>
        </label>
        <Hint>
          The one from GPay, PhonePe or your bank showing the amount and the
          reference number.
        </Hint>
      </div>

      <div>
        <Label>UPI reference (optional)</Label>
        <input
          name="reference"
          placeholder="e.g. 4512 3398 7712"
          className="w-full rounded-pill px-5 py-[0.9em] font-mono text-[0.921em]"
          style={{
            background: "var(--color-app-surface)",
            border: "1px solid var(--app-border)",
            color: "var(--color-app-ink)",
          }}
        />
        <Hint>Makes it quicker for the gym to find in their bank.</Hint>
      </div>

      <input type="hidden" name="method" value="upi" />

      {state && !state.ok && <ErrorNote>{state.error}</ErrorNote>}

      <Cta type="submit">Send to the gym</Cta>

      <p className="text-center text-[0.757em]" style={{ color: "var(--app-ink-45)" }}>
        Your membership updates once the gym checks the payment, not straight
        away.
      </p>
    </form>
  );
}
