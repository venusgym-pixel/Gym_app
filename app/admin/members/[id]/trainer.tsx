"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Select } from "@/components/admin/forms";
import { assignTrainer, unassignTrainer } from "@/lib/actions/workouts";

/* ============================================================================
   A-04b · Who coaches this member.

   This control did not exist, and its absence stopped the entire coaching
   surface working. assignTrainer() had been written and had no callers, so
   trainer_clients could only ever be populated by hand in SQL — which meant
   /trainer showed no clients, the board showed its empty state forever, and
   every attempt to write a session failed on RLS. The members list even told
   people they could "assign a trainer" here.

   Owner only, and the copy says so. A manager holds staff:view, so the
   database refuses their write; offering them a dropdown that always errors
   is worse than not offering one.
   ========================================================================= */

export interface TrainerOption {
  id: string;
  name: string;
}

export function TrainerCard({
  memberId,
  trainers,
  current,
  canEdit,
}: {
  memberId: string;
  trainers: TrainerOption[];
  current: TrainerOption | null;
  /** False for anyone but an owner — the card then just reports who it is. */
  canEdit: boolean;
}) {
  const router = useRouter();
  const [choice, setChoice] = useState("");
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  function run(fn: () => Promise<{ ok: boolean; message?: string; error?: string }>) {
    start(async () => {
      const r = await fn();
      setNote({ ok: r.ok, text: r.ok ? (r.message ?? "Done.") : (r.error ?? "Failed.") });
      if (r.ok) { setChoice(""); router.refresh(); }
    });
  }

  if (!canEdit) {
    return (
      <p className="text-[13px] text-neutral-700">
        {current ? current.name : "No trainer assigned."}
        <span className="mt-1 block text-[11.5px] text-neutral-600">
          Only an owner can change this.
        </span>
      </p>
    );
  }

  return (
    <div>
      {current ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[13.5px] font-medium">{current.name}</span>
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => unassignTrainer(memberId, current.id))}
            className="rounded-pill border border-neutral-300 px-3 py-1 text-[11.5px] font-semibold disabled:opacity-40"
          >
            Remove
          </button>
        </div>
      ) : (
        <p className="text-[13px] text-neutral-700">No trainer yet.</p>
      )}

      {trainers.length === 0 ? (
        <p className="mt-2 text-[11.5px] text-neutral-600">
          No trainers on staff. Invite one from the Staff screen first.
        </p>
      ) : (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Select
            value={choice}
            onChange={(e) => setChoice(e.target.value)}
            className="max-w-[220px]"
          >
            <option value="">{current ? "Change to…" : "Choose a trainer…"}</option>
            {trainers
              .filter((t) => t.id !== current?.id)
              .map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
          </Select>
          <button
            type="button"
            disabled={pending || !choice}
            onClick={() => run(() => assignTrainer(memberId, choice))}
            className="rounded-pill bg-neutral-900 px-4 py-2 text-[12.5px] font-semibold text-neutral-100 disabled:opacity-40"
          >
            {pending ? "Working…" : "Assign"}
          </button>
        </div>
      )}

      <p className="mt-2 text-[11.5px] text-neutral-600">
        A trainer only sees the members assigned to them, and can only write
        sessions for those members.
      </p>

      {note && (
        <p role="status" className={`mt-2 rounded-md px-3 py-2 text-[12px] ${
          note.ok ? "bg-sage-200 text-sage-800" : "bg-accent-200 text-accent-800"
        }`}>
          {note.text}
        </p>
      )}
    </div>
  );
}
