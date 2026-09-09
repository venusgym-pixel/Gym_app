"use client";

import { useState, useTransition } from "react";
import { approvePayment, rejectPayment } from "@/lib/actions/payment-proof";
import { formatINR } from "@/lib/money";

/* ============================================================================
   A-18 · Payments waiting to be checked.

   Everything on this card except the member is a CLAIM. The amount is not
   evidence — nobody typed it in, it is the price of the plan the member
   tapped, and a screenshot showing some other figure is trivially made: apps
   that fake a GPay success screen are sold openly. The only fact available to
   reception is what their own bank shows, which is why the UTR is the largest
   thing here and why Approve is gated behind having looked.

   The plan select is the correction, not a formality: paid the monthly amount
   against an annual claim, switch it to Monthly and the payment, the invoice
   and the term all come out at the monthly figure together. Approving with a
   mismatch left in place would issue a numbered GST invoice for money that
   never arrived, and invoice numbers are gap-free per financial year — there
   is no clean way back.
   ========================================================================= */

interface Plan {
  id: string;
  name: string;
  price_paise: string;
  duration_days: number;
}

export interface PendingClaim {
  id: string;
  memberName: string;
  memberCode: string;
  amountPaise: string;
  method: string;
  reference: string | null;
  createdAt: string;
  proofUrl: string | null;
  suggestedPlanId: string | null;
}

export function VerifyQueue({
  claims,
  plans,
}: {
  claims: PendingClaim[];
  plans: Plan[];
}) {
  if (claims.length === 0) {
    return (
      <p className="py-6 text-center text-[13px] text-neutral-600">
        Nothing waiting. Member-submitted payments appear here.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {claims.map((c) => (
        <ClaimCard key={c.id} claim={c} plans={plans} />
      ))}
    </div>
  );
}

function ClaimCard({ claim, plans }: { claim: PendingClaim; plans: Plan[] }) {
  const [planId, setPlanId] = useState(claim.suggestedPlanId ?? plans[0]?.id ?? "");
  const [reason, setReason] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const [checked, setChecked] = useState(false);
  const [copied, setCopied] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const [zoom, setZoom] = useState(false);

  const plan = plans.find((p) => p.id === planId);
  const claimedPlan = plans.find((p) => p.id === claim.suggestedPlanId);

  /* The figure that will actually be recorded and invoiced, which follows the
     select rather than the claim. Showing it live is the whole point: it is
     what reception is attesting to. */
  const willRecord = plan?.price_paise ?? claim.amountPaise;
  const mismatch = plan != null && plan.price_paise !== claim.amountPaise;

  function run(
    fn: (f: FormData) => Promise<{ ok: boolean; message?: string; error?: string }>,
    extra: Record<string, string>,
  ) {
    const form = new FormData();
    form.set("payment_id", claim.id);
    for (const [k, v] of Object.entries(extra)) form.set(k, v);
    start(async () => {
      const r = await fn(form);
      setNote({ ok: r.ok, text: r.ok ? (r.message ?? "Done.") : (r.error ?? "Failed.") });
    });
  }

  return (
    <div className="rounded-lg border border-accent-300 bg-surface p-4">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-[15px] font-semibold">{claim.memberName}</span>
        <span className="font-mono text-[11.5px] text-neutral-600">{claim.memberCode}</span>
        <span className="ml-auto text-[12px] text-neutral-600">
          {new Date(claim.createdAt).toLocaleString("en-IN")}
        </span>
      </div>

      <p className="mt-0.5 text-[12.5px] text-neutral-700">
        Says they sent{" "}
        <span className="tabular font-semibold">{formatINR(claim.amountPaise)}</span>
        {claimedPlan ? ` for ${claimedPlan.name}` : ""} by {claim.method.toUpperCase()}
      </p>

      {/* The one thing on this card that can be checked against a fact. */}
      <div className="mt-3 rounded-md bg-bg px-3 py-2.5">
        <p className="text-[11px] tracking-[0.06em] text-neutral-600 uppercase">
          Find this in the gym&apos;s account
        </p>
        {claim.reference ? (
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="tabular font-mono text-[16px] font-semibold break-all">
              {claim.reference}
            </span>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard?.writeText(claim.reference ?? "");
                setCopied(true);
              }}
              className="rounded-pill border border-neutral-300 px-3 py-1 text-[11.5px] font-semibold"
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        ) : (
          <p className="mt-1 text-[13px] text-neutral-700">
            No reference given — search your bank for {formatINR(claim.amountPaise)}{" "}
            around {new Date(claim.createdAt).toLocaleString("en-IN")}, or ask
            the member for the UPI reference.
          </p>
        )}
      </div>

      <div className="mt-3 grid gap-4 sm:grid-cols-[220px_1fr]">
        {claim.proofUrl ? (
          <button
            type="button"
            onClick={() => setZoom((z) => !z)}
            className="block overflow-hidden rounded-md border border-neutral-300"
            title="Tap to enlarge"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={claim.proofUrl}
              alt="Payment proof"
              className={zoom ? "w-full" : "h-[180px] w-full object-cover"}
            />
          </button>
        ) : (
          <div className="grid h-[180px] place-items-center rounded-md bg-bg text-[12px] text-neutral-600">
            No image attached
          </div>
        )}

        <div>
          <label className="block text-[12px] text-neutral-700">
            This pays for
            <select
              value={planId}
              onChange={(e) => {
                setPlanId(e.target.value);
                setChecked(false);
              }}
              className="mt-1 w-full rounded-md border border-neutral-300 bg-bg px-3 py-2 text-[13.5px]"
            >
              {plans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} — {formatINR(p.price_paise)}
                </option>
              ))}
            </select>
          </label>

          {mismatch && (
            <p className="mt-2 rounded-md bg-accent-200 px-3 py-2 text-[12px] text-accent-800">
              They claimed {formatINR(claim.amountPaise)} but this plan costs{" "}
              {formatINR(willRecord)}. Record what the bank shows — pick the
              plan that matches it, or reject and ask for the difference.
            </p>
          )}

          <label className="mt-3 flex items-start gap-2 text-[12.5px] text-neutral-800">
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) => setChecked(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0"
            />
            <span>
              I found {formatINR(willRecord)}
              {claim.reference ? ` (ref ${claim.reference})` : ""} in the
              gym&apos;s account. A screenshot on its own is not payment.
            </span>
          </label>

          <p className="mt-2 text-[11.5px] text-neutral-600">
            Approving records {formatINR(willRecord)}, adds{" "}
            {plan?.duration_days ?? 0} days to the membership and issues a
            numbered invoice. None of that undoes cleanly.
          </p>

          {note && (
            <p
              role="status"
              className={`mt-2 rounded-md px-3 py-2 text-[12.5px] ${
                note.ok ? "bg-sage-200 text-sage-800" : "bg-accent-200 text-accent-800"
              }`}
            >
              {note.text}
            </p>
          )}

          {rejecting ? (
            <div className="mt-3 space-y-2">
              <input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Why? The member sees this."
                className="w-full rounded-md border border-neutral-300 bg-bg px-3 py-2 text-[13px]"
              />
              {/* The member reads this, so a vague reason means a queue at the
                  desk. These are the three that actually come up. */}
              <div className="flex flex-wrap gap-1.5">
                {[
                  "We could not find this payment in our account.",
                  "The amount does not match the plan.",
                  "This reference has already been used.",
                ].map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setReason(r)}
                    className="rounded-pill border border-neutral-300 px-3 py-1 text-[11.5px]"
                  >
                    {r}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={pending || !reason.trim()}
                  onClick={() => run(rejectPayment, { reason })}
                  className="rounded-pill bg-accent-600 px-4 py-2 text-[12.5px] font-semibold text-neutral-100 disabled:opacity-40"
                >
                  Confirm reject
                </button>
                <button
                  type="button"
                  onClick={() => setRejecting(false)}
                  className="rounded-pill border border-neutral-300 px-4 py-2 text-[12.5px] font-semibold"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                disabled={pending || !planId || !checked}
                onClick={() => run(approvePayment, { plan_id: planId })}
                title={checked ? undefined : "Check the gym's account first"}
                className="rounded-pill bg-neutral-900 px-5 py-2 text-[12.5px] font-semibold text-neutral-100 disabled:opacity-40"
              >
                {pending ? "Working…" : "Approve"}
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => setRejecting(true)}
                className="rounded-pill border border-neutral-300 px-4 py-2 text-[12.5px] font-semibold text-neutral-800"
              >
                Reject
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
