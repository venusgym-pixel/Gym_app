"use client";

import { useActionState, useState } from "react";
import { recordPayment, manualCheckIn, type ActionResult } from "@/lib/actions/members";
import { Feedback, Field, Input, Select, Submit } from "@/components/admin/forms";
import { formatINR, gstSplit } from "@/lib/money";

/* ============================================================================
   A-15 · Assign or renew a membership, and take the money.

   The total is shown before the button is pressed, including GST and the
   resulting expiry date. docs/end-to-end-flow.md §2.5 makes this a rule:
   renewing early extends from the existing expiry, renewing late starts from
   today, and the member must see which one they are getting BEFORE paying.
   ========================================================================= */

interface Plan {
  id: string;
  name: string;
  duration_days: number;
  price_paise: string;
}

export function CollectPayment({
  memberId, plans, currentExpiry,
}: {
  memberId: string;
  plans: Plan[];
  currentExpiry: string | null;
}) {
  const [planId, setPlanId] = useState(plans[1]?.id ?? plans[0]?.id ?? "");
  const [state, action] = useActionState(
    async (_p: ActionResult | null, form: FormData) => recordPayment(form),
    null,
  );

  const plan = plans.find((p) => p.id === planId);
  const price = Number(plan?.price_paise ?? 0);
  const split = gstSplit(price);

  /* Mirrors next_expiry() in SQL: a live membership is extended from its own
     end date; a lapsed one restarts today. Shown, not assumed. */
  const base =
    currentExpiry && new Date(currentExpiry) > new Date()
      ? new Date(currentExpiry)
      : new Date();
  const newExpiry = plan
    ? new Date(base.getTime() + plan.duration_days * 86_400_000)
    : null;

  if (plans.length === 0) {
    return <p className="text-[13px] text-neutral-600">No plans set up yet.</p>;
  }

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="member_id" value={memberId} />

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Plan" required>
          <Select name="plan_id" value={planId}
                  onChange={(e) => setPlanId(e.target.value)} required>
            {plans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} — {formatINR(p.price_paise)} / {p.duration_days}d
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Payment method" required>
          <Select name="method" defaultValue="upi" required>
            <option value="upi">UPI</option>
            <option value="cash">Cash</option>
            <option value="card">Card</option>
            <option value="netbanking">Netbanking</option>
            <option value="bank_transfer">Bank transfer</option>
          </Select>
        </Field>
      </div>

      <Field
        label="Receipt photo"
        hint="Optional — the cash receipt, or the confirmation screen on their phone. Kept against this payment."
      >
        {/* capture="environment" opens the rear camera straight away on a
            phone, which is what reception is holding. */}
        <input
          type="file"
          name="receipt"
          accept="image/*"
          capture="environment"
          className="w-full text-[13px]"
        />
      </Field>

      <Field label="Reference" hint="UPI reference, cheque number — optional">
        <Input name="reference" placeholder="optional" />
      </Field>

      <dl className="rounded-md bg-bg p-4 text-[13px]">
        <div className="flex justify-between">
          <dt className="text-neutral-700">{plan?.name} plan</dt>
          <dd className="tabular">{formatINR(split.taxablePaise)}</dd>
        </div>
        <div className="mt-1.5 flex justify-between">
          <dt className="text-neutral-700">GST 18%</dt>
          <dd className="tabular">
            {formatINR(split.cgstPaise + split.sgstPaise + split.igstPaise)}
          </dd>
        </div>
        <div className="mt-2.5 flex justify-between border-t border-neutral-300 pt-2.5">
          <dt className="font-semibold">Total</dt>
          <dd className="tabular text-[16px] font-bold">{formatINR(split.totalPaise)}</dd>
        </div>
        {newExpiry && (
          <p className="mt-2 text-[12px] text-sage-700">
            Membership will run to{" "}
            {newExpiry.toLocaleDateString("en-IN",
              { day: "2-digit", month: "short", year: "numeric" })}
            {currentExpiry && new Date(currentExpiry) > new Date()
              ? " — the unused days are kept."
              : "."}
          </p>
        )}
      </dl>

      <Feedback state={state} />
      <Submit>Take {formatINR(split.totalPaise)}</Submit>
    </form>
  );
}

/* ── A-22 · front-desk check-in ───────────────────────────────────────────── */

export function CheckInButton({ memberId }: { memberId: string }) {
  const [state, action] = useActionState(
    async (): Promise<ActionResult> => manualCheckIn(memberId),
    null,
  );

  return (
    <form action={action} className="flex items-center gap-3">
      <Submit className="!bg-sage-700 hover:!bg-sage-800">Check in now</Submit>
      <div className="min-w-0 flex-1"><Feedback state={state} /></div>
    </form>
  );
}
