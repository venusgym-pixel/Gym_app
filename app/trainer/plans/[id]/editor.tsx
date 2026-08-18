"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  addDay, addExerciseToDay, deactivatePlan, deleteDay, moveItem,
  removeItem, renameDay, updateItemTargets, updatePlanMeta,
} from "@/lib/actions/plan-builder";
import { Feedback, Field, Input, Submit } from "@/components/admin/forms";
import type { ActionResult } from "@/lib/actions/members";

/* ============================================================================
   T-10 · The plan editor's moving parts.

   Everything here is a small form or a one-tap transition around the server
   actions in lib/actions/plan-builder.ts. No local model of the plan: every
   change revalidates the page and the server render is the truth, which is
   slower than optimistic state and immune to drifting out of sync with the
   two uniqueness constraints that govern ordering.
   ========================================================================= */

export interface EditorItem {
  id: string;
  position: number;
  sets: number;
  target_reps: number;
  target_weight_kg: number | null;
  rest_seconds: number;
  notes: string | null;
  name: string;
  muscle: string;
  equipment: string;
  machineDown: boolean;
}

export interface EditorDay {
  id: string;
  day_index: number;
  name: string;
  items: EditorItem[];
}

export interface LibraryOption {
  id: string;
  name: string;
  muscle: string;
  equipment: string;
  down: boolean;
}

/* ── plan meta ──────────────────────────────────────────────────────────── */

export function PlanMetaForm({
  plan,
}: {
  plan: { id: string; name: string; goal: string | null; is_template: boolean };
}) {
  const [state, action] = useActionState(
    async (_p: ActionResult | null, form: FormData) => updatePlanMeta(form),
    null,
  );

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="plan_id" value={plan.id} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Plan name" required>
          <Input name="name" defaultValue={plan.name} required minLength={2} />
        </Field>
        <Field label="Goal">
          <Input name="goal" defaultValue={plan.goal ?? ""} placeholder="Build strength" />
        </Field>
      </div>
      <label className="flex items-center gap-2 text-[13px] text-neutral-700">
        <input type="checkbox" name="is_template" value="true"
               defaultChecked={plan.is_template} className="h-4 w-4" />
        Template
      </label>
      <Feedback state={state} />
      <Submit>Save details</Submit>
    </form>
  );
}

export function ArchivePlan({ planId }: { planId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="text-right">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (!window.confirm("Archive this plan? It disappears from lists; logged sessions keep their history.")) return;
          start(async () => {
            const r = await deactivatePlan(planId);
            if (r.ok) router.push("/trainer/plans");
            else setError(r.error);
          });
        }}
        className="text-[12px] text-neutral-600 underline hover:text-neutral-800 disabled:opacity-50"
      >
        {pending ? "Archiving…" : "Archive plan"}
      </button>
      {error && <p className="mt-1 text-[11.5px] text-accent-700">{error}</p>}
    </div>
  );
}

/* ── days ───────────────────────────────────────────────────────────────── */

export function AddDayButton({ planId, dayCount }: { planId: string; dayCount: number }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (dayCount >= 7) return null;
  return (
    <div>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await addDay(planId);
            setError(r.ok ? null : r.error);
          })
        }
        className="rounded-pill bg-neutral-200 px-4 py-2 text-[13px] font-semibold text-neutral-800 hover:bg-neutral-300 disabled:opacity-50"
      >
        {pending ? "Adding…" : "+ Add a day"}
      </button>
      {error && <p className="mt-1 text-[11.5px] text-accent-700">{error}</p>}
    </div>
  );
}

function RenameDayForm({ day, planId }: { day: EditorDay; planId: string }) {
  const [state, action] = useActionState(
    async (_p: ActionResult | null, form: FormData) => renameDay(form),
    null,
  );

  return (
    <form action={action} className="flex flex-1 items-center gap-2">
      <input type="hidden" name="day_id" value={day.id} />
      <input type="hidden" name="plan_id" value={planId} />
      <span className="shrink-0 font-mono text-[10.5px] text-neutral-600">
        Day {day.day_index}
      </span>
      <Input name="name" defaultValue={day.name} required
             className="max-w-xs !py-1.5 text-[13.5px]" aria-label={`Name of day ${day.day_index}`} />
      <SmallSubmit>Rename</SmallSubmit>
      {state && !state.ok && (
        <span className="text-[11px] text-accent-700">{state.error}</span>
      )}
    </form>
  );
}

function DeleteDayButton({
  day, planId,
}: {
  day: EditorDay;
  planId: string;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          const warning = day.items.length
            ? `Delete "${day.name}" and its ${day.items.length} exercises? Later days shift up.`
            : `Delete "${day.name}"?`;
          if (!window.confirm(warning)) return;
          start(async () => {
            const r = await deleteDay(day.id, planId);
            if (!r.ok) setError(r.error);
          });
        }}
        className="text-[11.5px] text-neutral-600 underline hover:text-neutral-800 disabled:opacity-50"
      >
        {pending ? "Deleting…" : "Delete day"}
      </button>
      {error && <span className="text-[11px] text-accent-700">{error}</span>}
    </span>
  );
}

/* ── exercises within a day ─────────────────────────────────────────────── */

function AddExerciseForm({
  dayId, planId, options,
}: {
  dayId: string;
  planId: string;
  options: LibraryOption[];
}) {
  const [state, action] = useActionState(
    async (_p: ActionResult | null, form: FormData) => addExerciseToDay(form),
    null,
  );

  const byMuscle = new Map<string, LibraryOption[]>();
  for (const o of options) {
    const list = byMuscle.get(o.muscle) ?? [];
    list.push(o);
    byMuscle.set(o.muscle, list);
  }

  return (
    <form action={action} className="mt-3 flex flex-wrap items-center gap-2">
      <input type="hidden" name="day_id" value={dayId} />
      <input type="hidden" name="plan_id" value={planId} />
      <select
        name="exercise_id"
        required
        aria-label="Exercise to add"
        className="min-w-0 flex-1 basis-64 rounded-md border border-neutral-300 bg-bg px-3 py-2 text-[13px] outline-none focus-visible:border-accent-500"
      >
        <option value="">Add an exercise…</option>
        {[...byMuscle.entries()].map(([muscle, list]) => (
          <optgroup key={muscle} label={muscle}>
            {list.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name} · {o.equipment}{o.down ? " ⚠ machine down" : ""}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      <SmallSubmit>Add</SmallSubmit>
      {state && !state.ok && (
        <span className="text-[11px] text-accent-700">{state.error}</span>
      )}
    </form>
  );
}

function ItemRow({
  item, planId, first, last,
}: {
  item: EditorItem;
  planId: string;
  first: boolean;
  last: boolean;
}) {
  const [state, action] = useActionState(
    async (_p: ActionResult | null, form: FormData) => updateItemTargets(form),
    null,
  );
  const [pending, start] = useTransition();
  const [rowError, setRowError] = useState<string | null>(null);

  const num =
    "w-16 rounded-md border border-neutral-300 bg-bg px-2 py-1.5 text-center " +
    "text-[13px] tabular outline-none focus-visible:border-accent-500";

  return (
    <li className="rounded-md bg-bg p-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex shrink-0 flex-col gap-0.5">
          <MoveButton label="↑" title="Move up" disabled={first || pending}
                      onClick={() => start(async () => {
                        const r = await moveItem(item.id, planId, "up");
                        setRowError(r.ok ? null : r.error);
                      })} />
          <MoveButton label="↓" title="Move down" disabled={last || pending}
                      onClick={() => start(async () => {
                        const r = await moveItem(item.id, planId, "down");
                        setRowError(r.ok ? null : r.error);
                      })} />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-[14px] font-medium">{item.name}</span>
            {item.machineDown && (
              <span className="shrink-0 rounded-pill bg-accent-200 px-2 py-0.5 text-[10px] font-semibold text-accent-800">
                machine down
              </span>
            )}
          </div>
          <div className="text-[11px] text-neutral-600">
            {item.muscle} · {item.equipment}
          </div>
        </div>

        <button
          type="button"
          disabled={pending}
          onClick={() => {
            if (!window.confirm(`Remove ${item.name} from this day?`)) return;
            start(async () => {
              const r = await removeItem(item.id, planId);
              setRowError(r.ok ? null : r.error);
            });
          }}
          className="shrink-0 text-[11.5px] text-neutral-600 underline hover:text-neutral-800 disabled:opacity-50"
        >
          Remove
        </button>
      </div>

      <form action={action} className="mt-2 flex flex-wrap items-end gap-x-3 gap-y-2">
        <input type="hidden" name="item_id" value={item.id} />
        <input type="hidden" name="plan_id" value={planId} />
        <TargetField label="Sets">
          <input name="sets" type="number" min={1} max={20}
                 defaultValue={item.sets} className={num} />
        </TargetField>
        <TargetField label="Reps">
          <input name="target_reps" type="number" min={1} max={100}
                 defaultValue={item.target_reps} className={num} />
        </TargetField>
        <TargetField label="Weight kg">
          <input name="target_weight_kg" type="number" min={0} step="0.5"
                 defaultValue={item.target_weight_kg ?? ""} placeholder="—" className={num} />
        </TargetField>
        <TargetField label="Rest s">
          <input name="rest_seconds" type="number" min={0} max={600} step={15}
                 defaultValue={item.rest_seconds} className={num} />
        </TargetField>
        <TargetField label="Note" grow>
          <input name="notes" defaultValue={item.notes ?? ""} placeholder="Tempo, cues…"
                 className="w-full rounded-md border border-neutral-300 bg-bg px-2 py-1.5 text-[13px] outline-none focus-visible:border-accent-500" />
        </TargetField>
        <SmallSubmit>Save</SmallSubmit>
      </form>

      {state && !state.ok && (
        <p className="mt-1 text-[11px] text-accent-700">{state.error}</p>
      )}
      {state?.ok && state.message && (
        <p className="mt-1 text-[11px] text-sage-700">{state.message}</p>
      )}
      {rowError && <p className="mt-1 text-[11px] text-accent-700">{rowError}</p>}
    </li>
  );
}

export function DayEditor({
  day, planId, options, canDelete,
}: {
  day: EditorDay;
  planId: string;
  options: LibraryOption[];
  canDelete: boolean;
}) {
  return (
    <section className="rounded-lg bg-surface p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <RenameDayForm day={day} planId={planId} />
        {canDelete && <DeleteDayButton day={day} planId={planId} />}
      </div>

      {day.items.length === 0 ? (
        <p className="mt-3 text-[12.5px] text-neutral-600">
          No exercises yet — this day would show empty on a member&rsquo;s phone.
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {day.items.map((item, i) => (
            <ItemRow key={item.id} item={item} planId={planId}
                     first={i === 0} last={i === day.items.length - 1} />
          ))}
        </ul>
      )}

      <AddExerciseForm dayId={day.id} planId={planId} options={options} />
    </section>
  );
}

/* ── little shared bits ─────────────────────────────────────────────────── */

function TargetField({
  label, children, grow,
}: {
  label: string;
  children: React.ReactNode;
  grow?: boolean;
}) {
  return (
    <label className={grow ? "min-w-0 flex-1 basis-40" : "shrink-0"}>
      <span className="mb-0.5 block font-mono text-[9.5px] tracking-wider text-neutral-600 uppercase">
        {label}
      </span>
      {children}
    </label>
  );
}

function SmallSubmit({ children }: { children: React.ReactNode }) {
  return (
    <button
      type="submit"
      className="shrink-0 rounded-pill bg-neutral-900 px-3.5 py-1.5 text-[12px] font-semibold text-neutral-100 hover:bg-neutral-800"
    >
      {children}
    </button>
  );
}

function MoveButton({
  label, title, disabled, onClick,
}: {
  label: string;
  title: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
      className="grid h-6 w-6 place-items-center rounded-sm bg-neutral-200 text-[11px] text-neutral-700 hover:bg-neutral-300 disabled:opacity-30"
    >
      {label}
    </button>
  );
}
