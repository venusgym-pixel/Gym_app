"use client";

import { useActionState, useState, useTransition } from "react";
import { retryMessage, saveTemplate, toggleRule } from "@/lib/actions/messaging";
import { Feedback, Submit } from "@/components/admin/forms";

export function RuleToggle({
  id, on, disabled,
}: {
  id: string;
  on: boolean;
  disabled?: boolean;
}) {
  const [pending, start] = useTransition();
  const [value, setValue] = useState(on);

  return (
    <button
      type="button"
      role="switch"
      aria-checked={value}
      disabled={disabled || pending}
      onClick={() => {
        /* Flip immediately: the round trip is a database update the user has
           no reason to watch, and a toggle that lags feels broken. */
        const next = !value;
        setValue(next);
        const form = new FormData();
        form.set("id", id);
        form.set("on", next ? "1" : "0");
        start(async () => {
          const r = await toggleRule(form);
          if (!r.ok) setValue(!next);
        });
      }}
      className={`relative h-6 w-11 shrink-0 rounded-pill transition-colors disabled:opacity-40 ${
        value ? "bg-sage-600" : "bg-neutral-300"
      }`}
    >
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-pill bg-surface transition-all ${
          value ? "left-[22px]" : "left-0.5"
        }`}
      />
      <span className="sr-only">{value ? "On" : "Off"}</span>
    </button>
  );
}

export function TemplateEditor({
  id, label, body, disabled,
}: {
  id: string;
  label: string;
  body: string;
  disabled?: boolean;
}) {
  const [state, action] = useActionState(saveTemplate, null);
  const [text, setText] = useState(body);
  const dirty = text !== body;

  return (
    <form action={action} className="rounded-md border border-neutral-300 p-3">
      <input type="hidden" name="id" value={id} />
      <div className="mb-2 flex items-center justify-between">
        <span className="font-mono text-[10.5px] tracking-wider text-neutral-600 uppercase">
          {label}
        </span>
        {/* WhatsApp counts characters, and a long reminder gets truncated in
            the notification shade before anyone reads the renew link. */}
        <span className={`text-[10.5px] ${text.length > 320 ? "text-accent-700" : "text-neutral-600"}`}>
          {text.length}
        </span>
      </div>

      <textarea
        name="body"
        value={text}
        onChange={(e) => setText(e.target.value)}
        disabled={disabled}
        rows={3}
        className="w-full resize-y rounded-md border border-neutral-300 bg-bg px-3 py-2 text-[13px] outline-none focus-visible:border-accent-500 disabled:opacity-60"
      />

      {state && <div className="mt-2"><Feedback state={state} /></div>}

      {!disabled && dirty && (
        <div className="mt-2 flex items-center gap-2">
          <Submit className="!px-4 !py-1.5 !text-[12.5px]">Save</Submit>
          <button
            type="button"
            onClick={() => setText(body)}
            className="text-[12px] text-neutral-600 hover:underline"
          >
            Undo
          </button>
        </div>
      )}
    </form>
  );
}

export function RetryButton({ id }: { id: string }) {
  const [pending, start] = useTransition();
  const [done, setDone] = useState(false);

  if (done) return <span className="text-[11px] text-sage-700">requeued</span>;

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        const form = new FormData();
        form.set("id", id);
        start(async () => {
          const r = await retryMessage(form);
          if (r.ok) setDone(true);
        });
      }}
      className="rounded-pill border border-neutral-300 px-2.5 py-0.5 text-[11px] font-semibold text-neutral-800 hover:bg-neutral-200 disabled:opacity-50"
    >
      Send again
    </button>
  );
}
