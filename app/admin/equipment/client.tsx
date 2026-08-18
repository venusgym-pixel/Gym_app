"use client";

import { useActionState, useState, useTransition } from "react";
import {
  deleteEquipment, retireEquipment, saveEquipment, seedEquipment, setEquipmentStatus,
} from "@/lib/actions/equipment";
import { Feedback, Field, Input, Select, Submit } from "@/components/admin/forms";
import type { ActionResult } from "@/lib/actions/members";
import type { Equipment, EquipmentStatus } from "@/lib/db/database.types";

/* ============================================================================
   Equipment — the interactive half. The everyday action is flipping status
   (treadmill 2 broke this morning), so that is one tap on the row; the
   add/edit form hides in a <details> because registering kit happens rarely.
   ========================================================================= */

const CATEGORY_OPTIONS = [
  ["machine", "Machine"],
  ["cable", "Cable station"],
  ["cardio", "Cardio"],
  ["free_weight", "Free weights"],
  ["bench_rack", "Bench / rack"],
  ["accessory", "Accessory"],
] as const;

export function EquipmentForm({
  initial, onDone,
}: {
  initial?: Equipment;
  onDone?: () => void;
}) {
  const [state, action] = useActionState(
    async (_p: ActionResult | null, form: FormData) => {
      const r = await saveEquipment(form);
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
                 placeholder="Leg press machine" />
        </Field>
        <Field label="Category" required>
          <Select name="category" defaultValue={initial?.category ?? "machine"}>
            {CATEGORY_OPTIONS.map(([v, label]) => (
              <option key={v} value={v}>{label}</option>
            ))}
          </Select>
        </Field>
        <Field label="Brand">
          <Input name="brand" defaultValue={initial?.brand ?? ""} placeholder="Being Strong" />
        </Field>
        <Field label="Model">
          <Input name="model" defaultValue={initial?.model ?? ""} />
        </Field>
        <Field label="Quantity" hint="How many the floor has — 3 treadmills is one row.">
          <Input name="quantity" type="number" min={1} max={999}
                 defaultValue={initial?.quantity ?? 1} />
        </Field>
        <Field label="Status">
          <Select name="status" defaultValue={initial?.status ?? "working"}>
            <option value="working">Working</option>
            <option value="maintenance">Under maintenance</option>
            <option value="out_of_order">Out of order</option>
          </Select>
        </Field>
        <Field label="Purchased on">
          <Input name="purchased_on" type="date" defaultValue={initial?.purchased_on ?? ""} />
        </Field>
        <Field label="Photo URL" hint="A link for now — paste from your drive or the vendor page.">
          <Input name="photo_url" type="url" defaultValue={initial?.photo_url ?? ""}
                 placeholder="https://…" />
        </Field>
      </div>

      <Field label="Notes" hint="Warranty, service contact, quirks.">
        <Input name="notes" defaultValue={initial?.notes ?? ""} />
      </Field>

      <Feedback state={state} />
      <Submit>{initial ? "Save changes" : "Add equipment"}</Submit>
    </form>
  );
}

const STATUS_META: Record<EquipmentStatus, { label: string; cls: string }> = {
  working:      { label: "Working",     cls: "bg-sage-200 text-sage-800" },
  maintenance:  { label: "Maintenance", cls: "bg-accent-100 text-accent-800" },
  out_of_order: { label: "Out of order", cls: "bg-accent-200 text-accent-800" },
};

export function StatusChip({ status }: { status: EquipmentStatus }) {
  const m = STATUS_META[status];
  return (
    <span className={`rounded-pill px-2 py-0.5 text-[10.5px] font-semibold ${m.cls}`}>
      {m.label}
    </span>
  );
}

/** One tap per state. The current one is highlighted and inert. */
export function StatusButtons({ id, status }: { id: string; status: EquipmentStatus }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-wrap items-center gap-1">
      {(Object.keys(STATUS_META) as EquipmentStatus[]).map((s) => (
        <button
          key={s}
          type="button"
          disabled={pending || s === status}
          onClick={() =>
            start(async () => {
              setError(null);
              const r = await setEquipmentStatus(id, s);
              if (!r.ok) setError(r.error);
            })
          }
          className={`rounded-pill px-2.5 py-1 text-[11px] transition-colors ${
            s === status
              ? `${STATUS_META[s].cls} font-semibold`
              : "bg-neutral-200 text-neutral-700 hover:bg-neutral-300 disabled:opacity-50"
          }`}
        >
          {STATUS_META[s].label}
        </button>
      ))}
      {error && <span className="text-[11px] text-accent-700">{error}</span>}
    </div>
  );
}

export function RetireButton({ id, name }: { id: string; name: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (!window.confirm(`Retire "${name}"? It disappears from lists; exercises that use it keep working.`)) return;
          start(async () => {
            const r = await retireEquipment(id);
            if (!r.ok) setError(r.error);
          });
        }}
        className="text-[11.5px] text-neutral-600 underline hover:text-neutral-800 disabled:opacity-50"
      >
        {pending ? "Retiring…" : "Retire"}
      </button>
      {error && <span className="text-[11px] text-accent-700">{error}</span>}
    </>
  );
}

export function DeleteEquipmentButton({ id, name }: { id: string; name: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (!window.confirm(`Delete "${name}" permanently? Exercises linked to it lose the machine link. This cannot be undone.`)) return;
          start(async () => {
            const r = await deleteEquipment(id);
            if (!r.ok) setError(r.error);
          });
        }}
        className="text-[11.5px] text-accent-700 underline hover:text-accent-800 disabled:opacity-50"
      >
        {pending ? "Deleting…" : "Delete"}
      </button>
      {error && <span className="text-[11px] text-accent-700">{error}</span>}
    </>
  );
}

export function SeedEquipmentButton() {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);

  return (
    <div className="space-y-2">
      <button
        type="button"
        disabled={pending}
        onClick={() => start(async () => setResult(await seedEquipment()))}
        className="rounded-pill bg-neutral-900 px-5 py-2.5 text-[13.5px] font-semibold text-neutral-100 hover:bg-neutral-800 disabled:opacity-50"
      >
        {pending ? "Loading…" : "Load the starter list (14 items)"}
      </button>
      <Feedback state={result} />
    </div>
  );
}

/** Wraps the edit form so each row can expand in place. */
export function EditDisclosure({ initial }: { initial: Equipment }) {
  const [open, setOpen] = useState(false);
  return (
    <details
      open={open}
      onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}
    >
      <summary className="cursor-pointer list-none text-[11.5px] text-neutral-600 underline hover:text-neutral-800">
        Edit
      </summary>
      {open && (
        <div className="mt-3 rounded-md bg-bg p-3">
          <EquipmentForm initial={initial} onDone={() => setOpen(false)} />
        </div>
      )}
    </details>
  );
}
