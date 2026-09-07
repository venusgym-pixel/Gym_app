"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { submitPaymentProof } from "@/lib/actions/payment-proof";
import { Cta, ErrorNote, Hint, Label } from "@/components/ui/primitives";
import { formatINR } from "@/lib/money";
import { buildUpiLink } from "@/lib/upi";
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
  gymName,
  paymentLink,
  lastClaim,
}: {
  plans: Plan[];
  upiQrUrl: string | null;
  upiVpa: string | null;
  /** Shown as the payee inside the UPI app, so it must be the gym's name. */
  gymName: string;
  /** Optional hosted page, for gyms that already run one. */
  paymentLink: string | null;
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
  const proofInput = useRef<HTMLInputElement>(null);
  const [fromShare, setFromShare] = useState(false);

  /* A receipt shared in from GPay or PhonePe.

     Android's share sheet POSTs the file to the service worker, which stashes
     it and redirects here with ?shared=1. Picking it up means putting a real
     File into the file input, which is what DataTransfer is for — the form
     then submits exactly as if the member had chosen it by hand, and the
     server action needs to know nothing about any of this.

     Chrome-only territory by definition: Web Share Target does not exist on
     iOS, so nothing here ever runs there and the ordinary upload button
     stays the route. */
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!new URLSearchParams(window.location.search).has("shared")) return;

    let cancelled = false;
    (async () => {
      try {
        const cache = await caches.open("fitwell-share");
        const hit = await cache.match("/__shared-proof");
        if (!hit || cancelled) return;

        const blob = await hit.blob();
        const name = decodeURIComponent(hit.headers.get("x-filename") ?? "receipt.jpg");
        const file = new File([blob], name, { type: blob.type || "image/jpeg" });

        const dt = new DataTransfer();
        dt.items.add(file);
        if (proofInput.current) proofInput.current.files = dt.files;

        setFileName(name);
        setFromShare(true);

        /* Taken, so it cannot be attached to a second payment later. */
        await cache.delete("/__shared-proof");
      } catch {
        /* No cache, no permission, or a browser without DataTransfer. The
           member simply chooses the file the usual way. */
      }
    })();
    return () => { cancelled = true; };
  }, []);

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

  /* Rebuilt whenever the chosen plan changes, so the amount in the link is
     always the amount on screen. Null when the gym has given no usable VPA —
     a button that opens a payment app with no payee is worse than no button,
     because the member believes they have paid. */
  const upiLink = upiVpa
    ? buildUpiLink({
        vpa: upiVpa,
        payeeName: gymName,
        amountPaise: plan?.price_paise,
        note: plan ? `${plan.name} membership` : null,
      })
    : null;

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

          {/* One tap to GPay, PhonePe or a bank app, with the amount already
              filled in — the retyping is what produced wrong amounts for
              reception to reconcile.

              Android resolves upi:// through its app chooser; on iOS the
              generic scheme often resolves to nothing, so the QR and the
              typed id above stay exactly where they were. This is one more
              way to pay, not a replacement for the other two. */}
          {upiLink && (
            <a
              href={upiLink}
              className="mt-4 block w-full rounded-pill bg-app-accent py-3.5 text-center text-[0.987em] font-bold text-app-accent-ink"
            >
              Pay {plan ? formatINR(plan.price_paise) : ""} in your UPI app
            </a>
          )}

          <p className="mt-2 text-[0.757em]" style={{ color: "var(--app-ink-45)" }}>
            {upiLink
              ? "Or scan the code above from your UPI app."
              : "Screenshot the QR, or open your UPI app and scan it from there."}
          </p>

          {paymentLink && (
            <a
              href={paymentLink}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-block text-[0.822em] font-semibold text-app-accent underline"
            >
              Open the gym&rsquo;s payment page
            </a>
          )}
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
            ref={proofInput}
            type="file"
            name="proof"
            accept="image/*"
            required
            className="hidden"
            onChange={(e) => {
              setFileName(e.target.files?.[0]?.name ?? null);
              setFromShare(false);
            }}
          />
          <span className="text-[0.855em]" style={{ color: "var(--app-ink-55)" }}>
            {fromShare
              ? `Shared from your UPI app — ${fileName}`
              : fileName ?? "Tap to choose the payment screenshot"}
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
