"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, EmptyState } from "@/components/admin/shell";
import { Field, Input, Select } from "@/components/admin/forms";
import { clearPrescription, savePrescription } from "@/lib/actions/prescriptions";

/* ============================================================================
   The board, and the per-member editor over it.

   Two states per row and no third: either the plan decides, or the trainer
   does. Anything in between — half-written sessions, drafts — would be a
   member turning up to an empty screen, so a prescription is saved complete
   or not at all.
   ========================================================================= */

export interface LibraryExercise {
  id: string;
  name: string;
  primary_muscle: string;
  equipment: string;
}

export interface PlanDay {
  id: string;
  name: string;
  day_index: number;
  plan_id: string;
  workout_plans: { name: string } | null;
  workout_exercises: {
    exercise_id: string;
    position: number;
    sets: number;
    target_reps: number;
    target_weight_kg: string | null;
    rest_seconds: number;
  }[];
}

interface Item {
  exercise_id: string;
  sets: number;
  target_reps: number;
  target_weight_kg: string;
  rest_seconds: number;
  notes: string;
}

export interface BoardMember {
  id: string;
  name: string;
  code: string;
  prescription: {
    id: string;
    day_name: string;
    plan_name: string | null;
    day_id: string | null;
    note: string | null;
    prescription_items: {
      exercise_id: string;
      position: number;
      sets: number;
      target_reps: number;
      target_weight_kg: string | null;
      rest_seconds: number;
      notes: string | null;
    }[];
  } | null;
}

export function Board({
  members,
  today,
  library,
  days,
}: {
  members: BoardMember[];
  today: string;
  library: LibraryExercise[];
  days: PlanDay[];
}) {
  const [open, setOpen] = useState<string | null>(null);

  if (members.length === 0) {
    return (
      <Card>
        <EmptyState>
          No clients assigned to you yet. A manager assigns members to a trainer
          from the member profile.
        </EmptyState>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {members.map((m) => (
        <Card key={m.id}>
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="text-[15px] font-semibold">{m.name}</span>
            <span className="font-mono text-[11.5px] text-neutral-600">{m.code}</span>

            <span className="ml-auto">
              {m.prescription ? (
                <span className="rounded-sm bg-sage-200 px-2 py-0.5 text-[11px] font-semibold text-sage-800">
                  {m.prescription.day_name} · {m.prescription.prescription_items.length} exercises
                </span>
              ) : (
                <span className="rounded-sm bg-neutral-200 px-2 py-0.5 text-[11px] text-neutral-700">
                  Plan decides
                </span>
              )}
            </span>
          </div>

          {open === m.id ? (
            <Editor
              member={m}
              today={today}
              library={library}
              days={days}
              onDone={() => setOpen(null)}
            />
          ) : (
            <button
              type="button"
              onClick={() => setOpen(m.id)}
              className="mt-3 rounded-pill border border-neutral-300 px-4 py-1.5 text-[12px] font-semibold text-neutral-800"
            >
              {m.prescription ? "Edit today's session" : "Set today's session"}
            </button>
          )}
        </Card>
      ))}
    </div>
  );
}

function Editor({
  member, today, library, days, onDone,
}: {
  member: BoardMember;
  today: string;
  library: LibraryExercise[];
  days: PlanDay[];
  onDone: () => void;
}) {
  const router = useRouter();
  const rx = member.prescription;

  const [dayName, setDayName] = useState(rx?.day_name ?? "");
  const [dayId, setDayId] = useState(rx?.day_id ?? "");
  const [note, setNote] = useState(rx?.note ?? "");
  const [items, setItems] = useState<Item[]>(
    rx
      ? [...rx.prescription_items]
          .sort((a, b) => a.position - b.position)
          .map((i) => ({
            exercise_id: i.exercise_id,
            sets: i.sets,
            target_reps: i.target_reps,
            target_weight_kg: i.target_weight_kg ?? "",
            rest_seconds: i.rest_seconds,
            notes: i.notes ?? "",
          }))
      : [],
  );
  const [note2, setNote2] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  /* Prefilling from a plan day is the fast path: pull in what the programme
     already says, then change the two numbers that differ for this person. */
  function prefill(id: string) {
    const d = days.find((x) => x.id === id);
    if (!d) return;
    setDayId(d.id);
    setDayName(d.name);
    setItems(
      [...d.workout_exercises]
        .sort((a, b) => a.position - b.position)
        .map((e) => ({
          exercise_id: e.exercise_id,
          sets: e.sets,
          target_reps: e.target_reps,
          target_weight_kg: e.target_weight_kg ?? "",
          rest_seconds: e.rest_seconds,
          notes: "",
        })),
    );
  }

  function patch(i: number, part: Partial<Item>) {
    setItems((list) => list.map((it, n) => (n === i ? { ...it, ...part } : it)));
  }

  function save() {
    start(async () => {
      const r = await savePrescription({
        member_id: member.id,
        for_date: today,
        day_id: dayId,
        day_name: dayName,
        plan_name: days.find((d) => d.id === dayId)?.workout_plans?.name ?? "",
        note,
        items,
      });
      setNote2({ ok: r.ok, text: r.ok ? (r.message ?? "Saved.") : (r.error ?? "Failed.") });
      if (r.ok) { onDone(); router.refresh(); }
    });
  }

  function clear() {
    start(async () => {
      const r = await clearPrescription(member.id, today);
      setNote2({ ok: r.ok, text: r.ok ? (r.message ?? "Cleared.") : (r.error ?? "Failed.") });
      if (r.ok) { onDone(); router.refresh(); }
    });
  }

  return (
    <div className="mt-4 border-t border-neutral-300 pt-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Start from a plan day" hint="Pulls in its exercises, then edit below.">
          <Select value={dayId} onChange={(e) => prefill(e.target.value)}>
            <option value="">Choose a day…</option>
            {days.map((d) => (
              <option key={d.id} value={d.id}>
                {d.workout_plans?.name ?? "Plan"} · {d.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Call it" required hint="What the member sees at the top of the screen.">
          <Input value={dayName} onChange={(e) => setDayName(e.target.value)}
                 placeholder="Leg day — machines" maxLength={60} />
        </Field>
      </div>

      <div className="mt-4">
        <p className="mb-1.5 text-[12px] text-neutral-700">Exercises</p>

        {items.length === 0 && (
          <p className="rounded-md bg-bg px-3 py-2 text-[12px] text-neutral-600">
            Nothing yet. Start from a plan day above, or add exercises one at a time.
          </p>
        )}

        <div className="space-y-2">
          {items.map((it, i) => (
            <div key={i} className="rounded-md bg-bg p-3">
              <div className="flex gap-2">
                <Select
                  value={it.exercise_id}
                  onChange={(e) => patch(i, { exercise_id: e.target.value })}
                  className="flex-1"
                >
                  {library.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.name} · {x.equipment}
                    </option>
                  ))}
                </Select>
                <button
                  type="button"
                  onClick={() => setItems((l) => l.filter((_, n) => n !== i))}
                  className="rounded-pill px-3 text-[12px] font-semibold text-accent-700"
                >
                  Remove
                </button>
              </div>

              <div className="mt-2 grid grid-cols-4 gap-2">
                <Num label="Sets" value={it.sets}
                     onChange={(v) => patch(i, { sets: v })} min={1} max={20} />
                <Num label="Reps" value={it.target_reps}
                     onChange={(v) => patch(i, { target_reps: v })} min={1} max={100} />
                <label className="block">
                  <span className="mb-1 block text-[11px] text-neutral-600">Weight kg</span>
                  <Input
                    type="number" step="0.5" min={0} max={1000}
                    value={it.target_weight_kg}
                    onChange={(e) => patch(i, { target_weight_kg: e.target.value })}
                    placeholder="—"
                  />
                </label>
                <Num label="Rest s" value={it.rest_seconds}
                     onChange={(v) => patch(i, { rest_seconds: v })} min={0} max={600} />
              </div>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={() =>
            setItems((l) => [
              ...l,
              {
                exercise_id: library[0]?.id ?? "",
                sets: 3, target_reps: 10, target_weight_kg: "",
                rest_seconds: 90, notes: "",
              },
            ])
          }
          disabled={library.length === 0}
          className="mt-2 rounded-pill border border-neutral-300 px-4 py-1.5 text-[12px] font-semibold disabled:opacity-40"
        >
          Add exercise
        </button>
      </div>

      <Field label="Note for the member" hint="Optional — shown above the exercises.">
        <Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300}
               placeholder="Knee was sore last week — stop if it twinges" />
      </Field>

      {note2 && (
        <p role="status" className={`mt-3 rounded-md px-3 py-2 text-[12.5px] ${
          note2.ok ? "bg-sage-200 text-sage-800" : "bg-accent-200 text-accent-800"
        }`}>
          {note2.text}
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={save}
          disabled={pending || items.length === 0 || dayName.trim().length === 0}
          className="rounded-pill bg-neutral-900 px-5 py-2 text-[12.5px] font-semibold text-neutral-100 disabled:opacity-40"
          title={items.length === 0 ? "Add at least one exercise" : undefined}
        >
          {pending ? "Saving…" : "Save for today"}
        </button>
        <button type="button" onClick={onDone}
                className="rounded-pill border border-neutral-300 px-4 py-2 text-[12.5px] font-semibold">
          Cancel
        </button>
        {rx && (
          <button type="button" onClick={clear} disabled={pending}
                  className="rounded-pill px-3 py-2 text-[12.5px] font-semibold text-accent-700 underline">
            Clear — let the plan decide
          </button>
        )}
      </div>
    </div>
  );
}

function Num({
  label, value, onChange, min, max,
}: {
  label: string; value: number; onChange: (v: number) => void; min: number; max: number;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] text-neutral-600">{label}</span>
      <Input type="number" min={min} max={max} value={value}
             onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}
