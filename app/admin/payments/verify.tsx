"use client";

import { useState, useTransition } from "react";
import { approvePayment, rejectPayment } from "@/lib/actions/payment-proof";
import { formatINR } from "@/lib/money";

/* ============================================================================
   A-18 · Payments waiting to be checked.

   One card per claim, with the screenshot big enough to actually read the
   amount and the UPI reference — squinting at a thumbnail is how a wrong
   payment gets approved.

   Approving asks WHICH PLAN it pays for rather than assuming. The member
   picked a plan when they uploaded, but the amount they actually sent is the
   only thing that matters, and it is not always what they intended.
   ========================================================================= */

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
  plans: { id: string; name: string; price_paise: string }[];
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

function ClaimCard({
  claim,
  plans,
}: {
  claim: PendingClaim;
  plans: { id: string; name: string; price_paise: string }[];
}) {
  const [planId, setPlanId] = useState(claim.suggestedPlanId ?? plans[0]?.id ?? "");
  const [reason, setReason] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const [zoom, setZoom] = useState(false);

  function run(fn: (f: FormData) => Promise<{ ok: boolean; message?: string; error?: string }>, extra: Record<string, string>) {
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
        <span className="tabular ml-auto text-[17px] font-bold">
          {formatINR(claim.amountPaise)}
        </span>
      </div>

      <p className="mt-1 text-[12px] text-neutral-600">
        {claim.method.toUpperCase()}
        {claim.reference && ` · ref ${claim.reference}`}
        {" · "}
        {new Date(claim.createdAt).toLocaleString("en-IN")}
      </p>

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
              onChange={(e) => setPlanId(e.target.value)}
              className="mt-1 w-full rounded-md border border-neutral-300 bg-bg px-3 py-2 text-[13.5px]"
            >
              {plans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} — {formatINR(p.price_paise)}
                </option>
              ))}
            </select>
          </label>

          <p className="mt-2 text-[11.5px] text-neutral-600">
            Check the amount and the reference against your bank before
            approving. Approving extends the membership and issues a GST
            invoice, and neither undoes cleanly.
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
                disabled={pending || !planId}
                onClick={() => run(approvePayment, { plan_id: planId })}
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
