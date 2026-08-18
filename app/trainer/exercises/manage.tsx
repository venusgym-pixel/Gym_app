"use client";

import { useActionState, useState, useTransition } from "react";
import { deactivateExercise, saveExercise } from "@/lib/actions/exercises";
import { DIFFICULTIES, EQUIPMENT_KINDS, MUSCLES } from "@/lib/exercise-vocab";
import { Feedback, Field, Input, Select, Submit } from "@/components/admin/forms";
import type { ActionResult } from "@/lib/actions/members";

/* ============================================================================
   T-14 · Add / edit an exercise.

   One form serves both: a hidden id turns the insert into an update. The
   machine link is optional and comes from the gym's registered equipment, so
   "Lat pulldown" can point at the actual lat pulldown machine and inherit
   its working/broken status in the plan builder.
   ========================================================================= */

export interface MachineOption {
  id: string;
  name: string;
  status: string;
}

export interface ExerciseInitial {
  id: string;
  name: string;
  primary_muscle: string;
  secondary_muscles: string[];
  equipment: string;
  equipment_id: string | null;
  difficulty: string;
  instructions: string | null;
  common_mistakes: string | null;
  video_url: string | null;
}

export function ExerciseForm({
  initial, machines, onDone,
}: {
  initial?: ExerciseInitial;
  machines: MachineOption[];
  onDone?: () => void;
}) {
  const [state, action] = useActionState(
    async (_p: ActionResult | null, form: FormData) => {
      const r = await saveExercise(form);
      if (r.ok) onDone?.();
      return r;
    },
    null,
  );

  return (
    <form action={action} className="space-y-3">
      {initial && <input type="hidden" name="id" value={initial.id} />}

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name" required>
          <Input name="name" defaultValue={initial?.name} required minLength={2}
                 placeholder="Landmine press" />
        </Field>
        <Field label="Primary muscle" required>
          <Select name="primary_muscle" defaultValue={initial?.primary_muscle ?? "Chest"}>
            {MUSCLES.map((m) => <option key={m} value={m}>{m}</option>)}
          </Select>
        </Field>
        <Field label="Equipment type" required>
          <Select name="equipment" defaultValue={initial?.equipment ?? "Barbell"}>
            {EQUIPMENT_KINDS.map((e) => <option key={e} value={e}>{e}</option>)}
          </Select>
        </Field>
        <Field label="Specific machine" hint="Optional — flags the exercise when that machine is down.">
          <Select name="equipment_id" defaultValue={initial?.equipment_id ?? ""}>
            <option value="">None / not machine-specific</option>
            {machines.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}{m.status !== "working" ? " (currently down)" : ""}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Difficulty">
          <Select name="difficulty" defaultValue={initial?.difficulty ?? "beginner"}>
            {DIFFICULTIES.map((d) => (
              <option key={d} value={d} className="capitalize">{d}</option>
            ))}
          </Select>
        </Field>
        <Field label="Also works" hint="Comma-separated: Triceps, Core">
          <Input name="secondary_muscles"
                 defaultValue={initial?.secondary_muscles.join(", ") ?? ""} />
        </Field>
      </div>

      <Field label="Instructions" hint="How to perform it — members see this.">
        <Input name="instructions" defaultValue={initial?.instructions ?? ""} />
      </Field>
      <Field label="Common mistakes">
        <Input name="common_mistakes" defaultValue={initial?.common_mistakes ?? ""} />
      </Field>
      <Field label="Video URL" hint="YouTube or any demo link.">
        <Input name="video_url" type="url" defaultValue={initial?.video_url ?? ""}
               placeholder="https://…" />
      </Field>

      <Feedback state={state} />
      <Submit>{initial ? "Save changes" : "Add exercise"}</Submit>
    </form>
  );
}

export function EditExercise({
  initial, machines,
}: {
  initial: ExerciseInitial;
  machines: MachineOption[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <details
      open={open}
      onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}
      className="mt-2"
    >
      <summary className="cursor-pointer list-none text-[11.5px] text-neutral-600 underline hover:text-neutral-800">
        Edit
      </summary>
      {open && (
        <div className="mt-3 rounded-md bg-bg p-3">
          <ExerciseForm initial={initial} machines={machines} onDone={() => setOpen(false)} />
        </div>
      )}
    </details>
  );
}

export function HideExercise({ id, name }: { id: string; name: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (!window.confirm(`Hide "${name}" from the library? Plans already using it keep it.`)) return;
          start(async () => {
            const r = await deactivateExercise(id);
            if (!r.ok) setError(r.error);
          });
        }}
        className="text-[11.5px] text-neutral-600 underline hover:text-neutral-800 disabled:opacity-50"
      >
        {pending ? "Hiding…" : "Hide"}
      </button>
      {error && <span className="text-[11px] text-accent-700">{error}</span>}
    </span>
  );
}
