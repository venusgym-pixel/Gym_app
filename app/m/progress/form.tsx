"use client";

import { useActionState } from "react";
import { recordMeasurement } from "@/lib/actions/workouts";
import type { ActionResult } from "@/lib/actions/members";

/* ============================================================================
   M-27 · Log today's numbers.

   Every field shows last time's value as its placeholder. Nobody remembers
   their waist measurement, and an empty box invites a guess — seeing "89.0"
   greyed out is the difference between a real data point and a made-up one.
   Blank means "not measured today", not zero.
   ========================================================================= */

const FIELDS = [
  { name: "weight_kg", label: "Weight", unit: "kg", key: "weight" },
  { name: "body_fat_pct", label: "Body fat", unit: "%", key: "fat" },
  { name: "chest_cm", label: "Chest", unit: "cm", key: "chest" },
  { name: "waist_cm", label: "Waist", unit: "cm", key: "waist" },
  { name: "biceps_cm", label: "Biceps", unit: "cm", key: "biceps" },
  { name: "thigh_cm", label: "Thigh", unit: "cm", key: "thigh" },
] as const;

type Previous = Record<string, string | null> | null;

export function LogMeasurement({
  memberId, previous,
}: { memberId: string; previous: Previous }) {
  const [state, action, pending] = useActionState(
    async (_p: ActionResult | null, form: FormData) => recordMeasurement(form),
    null,
  );

  return (
    <form action={action} className="mt-3">
      <input type="hidden" name="member_id" value={memberId} />

      <div className="flex flex-col gap-2.5">
        {FIELDS.map((f) => {
          const prev = previous?.[f.key];
          return (
            <label
              key={f.name}
              className="flex items-center gap-3 rounded-pill px-5 py-3"
              style={{
                background: "var(--color-app-surface)",
                border: "1px solid var(--app-border)",
              }}
            >
              <span className="flex-1 text-[0.888em]" style={{ color: "var(--app-ink-70)" }}>
                {f.label}
              </span>
              <input
                name={f.name}
                inputMode="decimal"
                placeholder={prev != null ? String(Number(prev)) : "—"}
                aria-label={`${f.label} in ${f.unit}`}
                className="w-20 bg-transparent text-right text-[0.987em] outline-none"
                style={{ color: "var(--color-app-ink)" }}
              />
              <span className="w-6 text-[0.757em]" style={{ color: "var(--app-ink-40)" }}>
                {f.unit}
              </span>
            </label>
          );
        })}
      </div>

      {state && (
        <p
          role="status"
          className="mt-3 rounded-md px-4 py-2.5 text-[0.822em]"
          style={
            state.ok
              ? { background: "var(--app-good-soft-2)", color: "var(--color-app-good)" }
              : { background: "rgb(246 160 107 / 0.12)", color: "var(--color-app-accent)" }
          }
        >
          {state.ok ? state.message : state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="mt-4 w-full rounded-pill bg-app-accent py-4 text-[1.053em] font-bold text-app-accent-ink disabled:opacity-50"
      >
        {pending ? "Saving…" : "Save entry"}
      </button>

      <p className="mt-2 text-center text-[0.724em]" style={{ color: "var(--app-ink-40)" }}>
        Leave anything blank that you did not measure today.
      </p>
    </form>
  );
}
