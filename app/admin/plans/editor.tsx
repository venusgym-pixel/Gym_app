"use client";

import { useState, useTransition } from "react";
import { deletePlan, savePlan, setPlanActive } from "@/lib/actions/plans";
import { Field, Input, Submit } from "@/components/admin/forms";
import { formatINR, gstSplit, paiseToRupees } from "@/lib/money";

/* ============================================================================
   A-14 · Create and edit a membership plan.

   The price field carries a live GST line under it, because the number the
   owner types is not the number the member pays. Prices are quoted ex-GST
   throughout this product and 18% is added at checkout; typing 3200 and
   discovering later that members were charged 3776 is the kind of surprise
   that ends in a refund conversation.

   Length is offered as four presets plus a free field. Everyone sells monthly,
   quarterly, half-yearly and annual — but "45-day summer offer" is a real
   thing and a dropdown alone would have made it impossible.
   ========================================================================= */

export interface PlanRow {
  id: string;
  name: string;
  duration_days: number;
  price_paise: string;
  joining_fee_paise: string;
  pt_sessions: number;
  freeze_days_allowed: number;
  description: string | null;
  sort_order: number;
  is_visible_to_members: boolean;
  is_active: boolean;
}

const PRESETS = [
  { label: "Monthly", days: 30 },
  { label: "Quarterly", days: 90 },
  { label: "Half-yearly", days: 180 },
  { label: "Annual", days: 365 },
];

export function PlanEditor({
  plan,
  gstEnabled,
  liveCount,
  soldCount,
  onDone,
}: {
  plan: PlanRow | null;
  /** Off for a gym below the registration threshold: the number typed here is
   *  then the whole price, so the label and the preview both have to change. */
  gstEnabled: boolean;
  /** On this plan right now — drives the "changing the price" warning. */
  liveCount: number;
  /** Ever sold on this plan, expired included. Deleting is blocked by any of
   *  them, not just the live ones, so the button is gated on this instead. */
  soldCount: number;
  onDone: () => void;
}) {
  const [price, setPrice] = useState(
    plan ? String(paiseToRupees(plan.price_paise)) : "",
  );
  const [days, setDays] = useState(String(plan?.duration_days ?? 30));
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  const rupees = Number(price);
  const preview =
    Number.isFinite(rupees) && rupees > 0
      ? gstSplit(Math.round(rupees * 100), { enabled: gstEnabled })
      : null;
  const perMonth =
    preview && Number(days) > 0
      ? Math.round((rupees * 100) / (Number(days) / 30))
      : null;

  function submit(form: FormData) {
    start(async () => {
      const r = await savePlan(form);
      setNote({ ok: r.ok, text: r.ok ? (r.message ?? "Saved.") : (r.error ?? "Failed.") });
      if (r.ok) onDone();
    });
  }

  return (
    <form action={submit} className="space-y-4">
      {plan && <input type="hidden" name="id" value={plan.id} />}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Plan name" required hint="What members see. Must be unique.">
          <Input name="name" defaultValue={plan?.name ?? ""} required
                 placeholder="e.g. Annual" maxLength={60} />
        </Field>

        <Field label="Length in days" required hint="How long one term runs.">
          <div className="flex flex-wrap gap-1.5">
            {PRESETS.map((p) => (
              <button
                key={p.days}
                type="button"
                onClick={() => setDays(String(p.days))}
                className={`rounded-pill border px-3 py-1 text-[11.5px] font-semibold ${
                  days === String(p.days)
                    ? "border-neutral-900 bg-neutral-900 text-neutral-100"
                    : "border-neutral-300 text-neutral-700"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <Input
            name="duration_days"
            type="number" inputMode="numeric"
            min={1}
            max={3650}
            required
            value={days}
            onChange={(e) => setDays(e.target.value)}
            className="mt-1.5"
          />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label={gstEnabled ? "Price, excluding GST" : "Price"}
          required
          hint={gstEnabled ? "Whole rupees." : "Whole rupees. What the member pays."}
        >
          <Input
            name="price_rupees"
            type="number" inputMode="numeric"
            min={0}
            step={1}
            required
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="3200"
          />
          {preview && (
            <div className="mt-1.5 rounded-md bg-bg px-3 py-2 text-[11.5px] text-neutral-700">
              {gstEnabled && (
                <div className="flex justify-between">
                  <span>Member pays with 18% GST</span>
                  <span className="tabular font-semibold text-ink">
                    {formatINR(preview.totalPaise)}
                  </span>
                </div>
              )}
              {perMonth && (
                <div className="mt-0.5 flex justify-between">
                  <span>Works out at</span>
                  <span className="tabular">{formatINR(perMonth)} / month</span>
                </div>
              )}
            </div>
          )}
        </Field>

        <Field label="Joining fee" hint="One-off, on the first term. 0 for none.">
          <Input name="joining_fee_rupees" type="number" inputMode="numeric" min={0} step={1}
                 defaultValue={plan ? paiseToRupees(plan.joining_fee_paise) : 0} />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="PT sessions included" hint="0 for a gym-only plan.">
          <Input name="pt_sessions" type="number" inputMode="numeric" min={0} max={365}
                 defaultValue={plan?.pt_sessions ?? 0} />
        </Field>

        <Field label="Freeze days allowed" hint="Days a member may pause for.">
          <Input name="freeze_days_allowed" type="number" inputMode="numeric" min={0} max={365}
                 defaultValue={plan?.freeze_days_allowed ?? 0} />
        </Field>

        <Field label="Sort order" hint="Lower shows first.">
          <Input name="sort_order" type="number" inputMode="numeric" min={0} max={999}
                 defaultValue={plan?.sort_order ?? 0} />
        </Field>
      </div>

      <Field label="Description" hint="Optional. One line, shown under the name.">
        <Input name="description" defaultValue={plan?.description ?? ""} maxLength={300}
               placeholder="Includes locker and one guest pass" />
      </Field>

      <div className="space-y-2">
        <Toggle name="is_active" defaultChecked={plan?.is_active ?? true}
                label="On sale"
                hint="Off means reception can no longer sell it. Existing members keep their term." />
        <Toggle name="is_visible_to_members" defaultChecked={plan?.is_visible_to_members ?? true}
                label="Show in the member app"
                hint="Off keeps it sellable at the desk but hides it from the pay screen." />
      </div>

      {plan && liveCount > 0 && (
        <p className="rounded-md bg-accent-200 px-3 py-2 text-[12px] text-accent-800">
          {liveCount} member{liveCount === 1 ? " is" : "s are"} on this plan right
          now. Changing the price does not touch what they paid — their invoices
          stand, and the new price applies to the next sale.
        </p>
      )}

      {note && (
        <p role="status" className={`rounded-md px-3 py-2 text-[12.5px] ${
          note.ok ? "bg-sage-200 text-sage-800" : "bg-accent-200 text-accent-800"
        }`}>
          {note.text}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Submit>{plan ? "Save changes" : "Create plan"}</Submit>
        <button type="button" onClick={onDone}
                className="rounded-pill border border-neutral-300 px-4 py-2 text-[12.5px] font-semibold">
          Cancel
        </button>
        {plan && <Danger plan={plan} soldCount={soldCount} pending={pending} onDone={onDone} />}
      </div>
    </form>
  );
}

function Toggle({
  name, label, hint, defaultChecked,
}: {
  name: string; label: string; hint: string; defaultChecked: boolean;
}) {
  return (
    <label className="flex items-start gap-2.5">
      <input type="checkbox" name={name} defaultChecked={defaultChecked}
             className="mt-0.5 h-4 w-4 shrink-0" />
      <span>
        <span className="block text-[13px] font-medium">{label}</span>
        <span className="block text-[11.5px] text-neutral-600">{hint}</span>
      </span>
    </label>
  );
}

/* Withdrawing is the ordinary end of a plan's life; deleting is only for one
   created by mistake. Presented in that order, and the delete refuses itself
   with a reason once anything has been sold. */
function Danger({
  plan, soldCount, pending, onDone,
}: {
  plan: PlanRow; soldCount: number; pending: boolean; onDone: () => void;
}) {
  const [busy, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  return (
    <>
      <button
        type="button"
        disabled={busy || pending}
        onClick={() =>
          start(async () => {
            const r = await setPlanActive(plan.id, !plan.is_active);
            if (r.ok) onDone();
            else setErr(r.error ?? "Failed.");
          })
        }
        className="rounded-pill border border-neutral-300 px-4 py-2 text-[12.5px] font-semibold text-neutral-800"
      >
        {plan.is_active ? "Withdraw from sale" : "Put back on sale"}
      </button>

      {soldCount === 0 && (
        <button
          type="button"
          disabled={busy || pending}
          onClick={() =>
            start(async () => {
              const r = await deletePlan(plan.id);
              if (r.ok) onDone();
              else setErr(r.error ?? "Failed.");
            })
          }
          className="rounded-pill px-3 py-2 text-[12.5px] font-semibold text-accent-700 underline"
        >
          Delete
        </button>
      )}

      {err && (
        <p role="status" className="w-full rounded-md bg-accent-200 px-3 py-2 text-[12.5px] text-accent-800">
          {err}
        </p>
      )}
    </>
  );
}
