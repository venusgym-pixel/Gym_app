"use client";

import { useActionState, useState, useTransition } from "react";
import { convertLead, createLead, logActivity, updateLead } from "@/lib/actions/leads";
import { Feedback, Field, Input, Select, Submit } from "@/components/admin/forms";
import { formatDate } from "@/lib/money";
import type { Lead } from "./page";

const STATUS_LABEL: Record<Lead["status"], string> = {
  new: "New",
  contacted: "Contacted",
  trial_booked: "Trial booked",
  trial_done: "Trial done",
  won: "Member",
  lost: "Lost",
};

export function NewLeadForm({
  plans,
}: {
  plans: { id: string; name: string }[];
}) {
  const [state, action] = useActionState(createLead, null);

  return (
    <form action={action} className="space-y-3.5" key={state?.ok ? state.id : "new"}>
      <Field label="Name" required>
        <Input name="full_name" required placeholder="Walk-in name" />
      </Field>

      <Field label="Mobile" required hint="10 digits. +91 is added.">
        <Input name="phone" required inputMode="numeric" maxLength={10} placeholder="9845012345" />
      </Field>

      <Field label="Email">
        <Input name="email" type="email" />
      </Field>

      <div className="grid gap-3.5 sm:grid-cols-2">
        <Field label="Source" hint="Where they heard about you.">
          <Input name="source" list="lead-sources" placeholder="Walk-in" />
        </Field>
        <Field label="Call back on">
          <Input name="next_follow_up_on" type="date" />
        </Field>
      </div>

      {/* A datalist, not a select: suggestions without forcing a taxonomy the
          gym will fight with. */}
      <datalist id="lead-sources">
        {["Walk-in", "Phone", "Instagram", "Referral", "Google", "Poster"].map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>

      {plans.length > 0 && (
        <Field label="Interested in">
          <Select name="interested_plan_id" defaultValue="">
            <option value="">Not sure yet</option>
            {plans.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </Select>
        </Field>
      )}

      <Field label="Notes">
        <Input name="notes" placeholder="Wants evening slots, asked about PT" />
      </Field>

      <Feedback state={state} />
      <Submit>Add enquiry</Submit>

      <p className="text-[11.5px] text-neutral-600">
        With no date set, the call-back defaults to tomorrow — a lead with no
        date is a lead nobody rings.
      </p>
    </form>
  );
}

/* ── one lead in the worklist ─────────────────────────────────────────────── */

export function LeadCard({
  lead, plans, planName, canEdit, today, overdue,
}: {
  lead: Lead;
  plans: { id: string; name: string }[];
  planName: Map<string, string>;
  canEdit: boolean;
  today: string;
  overdue?: boolean;
}) {
  const [pending, start] = useTransition();
  const [note, setNote] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  void plans;

  function run(form: FormData, fn: (f: FormData) => Promise<{ ok: boolean; message?: string; error?: string }>) {
    start(async () => {
      const r = await fn(form);
      setNote(r.ok ? (r.message ?? "Saved.") : (r.error ?? "Failed."));
    });
  }

  const history = [...lead.lead_activities].sort((a, b) =>
    b.created_at.localeCompare(a.created_at),
  );

  return (
    <div
      className={`rounded-md border p-3 ${
        overdue ? "border-accent-400 bg-accent-100" : "border-neutral-300 bg-bg"
      }`}
    >
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-[14.5px] font-semibold">{lead.full_name}</span>
        <a href={`tel:${lead.phone}`} className="font-mono text-[12px] text-neutral-700 hover:underline">
          {lead.phone}
        </a>
        <span className="rounded-pill bg-neutral-200 px-2 py-0.5 text-[10.5px] font-semibold text-neutral-700">
          {STATUS_LABEL[lead.status]}
        </span>
        {lead.source && (
          <span className="text-[11.5px] text-neutral-600">{lead.source}</span>
        )}
        <span className="ml-auto text-[11.5px] text-neutral-700">
          {lead.next_follow_up_on
            ? `${overdue ? "was due " : "due "}${formatDate(lead.next_follow_up_on)}`
            : "no date set"}
        </span>
      </div>

      {(lead.notes || lead.interested_plan_id) && (
        <p className="mt-1.5 text-[12.5px] text-neutral-700">
          {lead.interested_plan_id && (
            <span className="font-medium">
              {planName.get(lead.interested_plan_id) ?? "A plan"}
              {lead.notes ? " · " : ""}
            </span>
          )}
          {lead.notes}
        </p>
      )}

      {canEdit && (
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          <a
            href={`https://wa.me/${lead.phone.replace(/\D/g, "")}`}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-pill bg-sage-600 px-3 py-1 text-[12px] font-semibold text-neutral-100"
          >
            WhatsApp
          </a>

          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="rounded-pill border border-neutral-300 px-3 py-1 text-[12px] font-semibold text-neutral-800 hover:bg-neutral-200"
          >
            {open ? "Close" : "Log a call"}
          </button>

          <select
            value={lead.status}
            disabled={pending}
            onChange={(e) => {
              const form = new FormData();
              form.set("id", lead.id);
              form.set("status", e.target.value);
              run(form, updateLead);
            }}
            className="rounded-md border border-neutral-300 bg-surface px-2 py-1 text-[12px]"
          >
            {(Object.keys(STATUS_LABEL) as Lead["status"][])
              .filter((s) => s !== "won")
              .map((s) => (
                <option key={s} value={s}>{STATUS_LABEL[s]}</option>
              ))}
          </select>

          <button
            type="button"
            disabled={pending}
            onClick={() => {
              const form = new FormData();
              form.set("id", lead.id);
              run(form, convertLead);
            }}
            className="rounded-pill bg-neutral-900 px-3 py-1 text-[12px] font-semibold text-neutral-100 disabled:opacity-50"
          >
            Make member
          </button>
        </div>
      )}

      {open && canEdit && (
        <form
          action={(form) => {
            form.set("lead_id", lead.id);
            run(form, logActivity);
            setOpen(false);
          }}
          className="mt-3 space-y-2 rounded-md bg-surface p-3"
        >
          <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
            <input
              name="body"
              required
              minLength={2}
              placeholder="Called — asked to ring back Thursday evening"
              className="w-full rounded-md border border-neutral-300 bg-bg px-3 py-2 text-[13px] outline-none focus-visible:border-accent-500"
            />
            <select
              name="kind"
              defaultValue="call"
              className="rounded-md border border-neutral-300 bg-bg px-2 py-2 text-[13px]"
            >
              <option value="call">Call</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="visit">Visit</option>
              <option value="note">Note</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-[11.5px] text-neutral-700">Next call-back</label>
            <input
              name="next_follow_up_on"
              type="date"
              defaultValue={today}
              className="rounded-md border border-neutral-300 bg-bg px-2 py-1 text-[12.5px]"
            />
            <button
              type="submit"
              className="ml-auto rounded-pill bg-neutral-900 px-4 py-1.5 text-[12.5px] font-semibold text-neutral-100"
            >
              Save
            </button>
          </div>
        </form>
      )}

      {history.length > 0 && (
        <details className="mt-2">
          <summary className="cursor-pointer text-[11.5px] text-neutral-600">
            {history.length} note{history.length === 1 ? "" : "s"}
          </summary>
          <ul className="mt-1.5 space-y-1">
            {history.slice(0, 6).map((a) => (
              <li key={a.id} className="flex gap-2 text-[11.5px] text-neutral-700">
                <span className="shrink-0 text-neutral-600">{formatDate(a.created_at)}</span>
                <span className="min-w-0">{a.body}</span>
              </li>
            ))}
          </ul>
        </details>
      )}

      {note && <p role="status" className="mt-2 text-[11.5px] text-sage-700">{note}</p>}
    </div>
  );
}
