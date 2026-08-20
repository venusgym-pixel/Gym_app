"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, EmptyState } from "@/components/admin/shell";
import { formatINR, gstSplit } from "@/lib/money";
import { PlanEditor, type PlanRow } from "./editor";

/* ============================================================================
   A-13 · The plan list, and the editor over it.

   Withdrawn plans stay on screen rather than vanishing. A gym that stopped
   selling Quarterly in March still has people on it until next March, and a
   list that hides it makes those memberships look like they came from nowhere.
   ========================================================================= */

export interface PlanWithCounts extends PlanRow {
  liveCount: number;
  soldCount: number;
}

export function PlansManager({ plans }: { plans: PlanWithCounts[] }) {
  const router = useRouter();
  /* null = closed, "new" = creating, otherwise the id being edited. */
  const [open, setOpen] = useState<string | null>(null);

  function done() {
    setOpen(null);
    router.refresh();
  }

  const editing = plans.find((p) => p.id === open) ?? null;

  return (
    <>
      <div className="mb-5">
        {open === "new" || editing ? (
          <Card title={editing ? `Edit ${editing.name}` : "New plan"}>
            <PlanEditor
              key={editing?.id ?? "new"}
              plan={editing}
              liveCount={editing?.liveCount ?? 0}
              soldCount={editing?.soldCount ?? 0}
              onDone={done}
            />
          </Card>
        ) : (
          <button
            type="button"
            onClick={() => setOpen("new")}
            className="rounded-pill bg-neutral-900 px-5 py-2 text-[12.5px] font-semibold text-neutral-100 hover:bg-neutral-800"
          >
            New plan
          </button>
        )}
      </div>

      {plans.length === 0 ? (
        <Card>
          <EmptyState>
            No plans yet. Create one and it becomes sellable at the desk and, if
            you let it, visible in the member app.
          </EmptyState>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-3">
          {plans.map((p) => {
            const split = gstSplit(Number(p.price_paise));
            const perMonth = Math.round(Number(p.price_paise) / (p.duration_days / 30));
            return (
              <Card key={p.id}>
                <div className="flex items-baseline justify-between gap-2">
                  <h3 className="text-[20px]">{p.name}</h3>
                  <span className="tabular text-[20px] font-bold text-accent-700">
                    {formatINR(p.price_paise)}
                  </span>
                </div>

                {p.description && (
                  <p className="mt-1 text-[12px] text-neutral-600">{p.description}</p>
                )}

                <dl className="mt-3 space-y-1 text-[12.5px] text-neutral-700">
                  <Line label="Duration" value={`${p.duration_days} days`} />
                  <Line label="With GST" value={formatINR(split.totalPaise)} />
                  <Line label="Effective / month" value={formatINR(perMonth)} />
                  {p.joining_fee_paise !== "0" && Number(p.joining_fee_paise) > 0 && (
                    <Line label="Joining fee" value={formatINR(p.joining_fee_paise)} />
                  )}
                  {p.pt_sessions > 0 && (
                    <Line label="PT sessions" value={String(p.pt_sessions)} />
                  )}
                  <Line label="Freeze allowance" value={`${p.freeze_days_allowed} days`} />
                  <Line label="On this plan now" value={String(p.liveCount)} strong />
                </dl>

                <div className="mt-3 flex flex-wrap gap-1.5">
                  {!p.is_active && <Tag tone="warn">Not on sale</Tag>}
                  {p.is_active && !p.is_visible_to_members && (
                    <Tag tone="muted">Desk only</Tag>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => setOpen(p.id)}
                  className="mt-3 rounded-pill border border-neutral-300 px-4 py-1.5 text-[12px] font-semibold text-neutral-800"
                >
                  Edit
                </button>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}

function Line({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex justify-between">
      <dt>{label}</dt>
      <dd className={`tabular ${strong ? "font-semibold text-ink" : ""}`}>{value}</dd>
    </div>
  );
}

function Tag({ children, tone }: { children: React.ReactNode; tone: "warn" | "muted" }) {
  return (
    <span
      className={`rounded-sm px-2 py-0.5 text-[11px] ${
        tone === "warn" ? "bg-accent-200 text-accent-800" : "bg-neutral-200 text-neutral-700"
      }`}
    >
      {children}
    </span>
  );
}
