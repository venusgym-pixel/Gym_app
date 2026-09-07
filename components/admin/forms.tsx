"use client";

import { useFormStatus } from "react-dom";
import { useState } from "react";
import type { ComponentPropsWithoutRef, ReactNode } from "react";

/* ============================================================================
   Form primitives for the admin surface. Light theme, matching the shell.
   ========================================================================= */

export function Field({
  label, hint, children, required,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[12px] text-neutral-700">
        {label}
        {required && <span className="ml-0.5 text-accent-600">*</span>}
      </span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-neutral-600">{hint}</span>}
    </label>
  );
}

const inputCls =
  "w-full rounded-md border border-neutral-300 bg-bg px-3 py-2 text-[14px] " +
  "outline-none placeholder:text-neutral-500 focus-visible:border-accent-500";

export function Input(props: ComponentPropsWithoutRef<"input">) {
  return <input {...props} className={`${inputCls} ${props.className ?? ""}`} />;
}

export function Select({
  children, ...props
}: ComponentPropsWithoutRef<"select">) {
  return (
    <select {...props} className={`${inputCls} ${props.className ?? ""}`}>
      {children}
    </select>
  );
}

/** Disabled while the action is in flight, so a slow network cannot produce
 *  two members or two payments from one impatient double-click. */
export function Submit({
  children, className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={`rounded-pill bg-neutral-900 px-5 py-2.5 text-[13.5px] font-semibold text-neutral-100 transition-opacity hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
    >
      {pending ? "Working…" : children}
    </button>
  );
}

export function Feedback({
  state,
}: {
  state: { ok: true; message?: string } | { ok: false; error: string } | null;
}) {
  if (!state) return null;
  const good = state.ok;
  return (
    <p
      role="status"
      className={`rounded-md px-3 py-2 text-[13px] ${
        good ? "bg-sage-200 text-sage-800" : "bg-accent-200 text-accent-800"
      }`}
    >
      {good ? state.message : state.error}
    </p>
  );
}

/* ============================================================================
   A dropdown that does not trap you in its own vocabulary.

   Picks the listed option, or "Other…" and then types. Only one field is ever
   submitted under `name` — a hidden input while a listed option is chosen, the
   text box itself once it is not — so the action sees a plain string either
   way and needs no second field to reconcile.

   Only for columns that genuinely accept any text. A select over a Postgres
   enum or a CHECK constraint must NOT use this: the typed value would pass
   the form, fail at the database, and reach the user as "could not save".
   Foreign-key pickers likewise — "other" there means creating a record, which
   is a different screen, not a text box.

   Editing is the case that catches people out: a row already holding a value
   nobody listed has to open in Other mode with that value in the box, or the
   first save silently rewrites it to whichever option happened to be first.
   ========================================================================= */
export function SelectOrOther({
  name,
  options,
  defaultValue = "",
  placeholder,
  includeBlank,
  blankLabel = "Not specified",
  required,
}: {
  name: string;
  options: readonly string[];
  defaultValue?: string;
  placeholder?: string;
  /** Allow "no answer" as distinct from a typed one. */
  includeBlank?: boolean;
  blankLabel?: string;
  required?: boolean;
}) {
  const listed = defaultValue === "" || options.includes(defaultValue);
  const [choice, setChoice] = useState(listed ? defaultValue : OTHER);
  const [typed, setTyped] = useState(listed ? "" : defaultValue);

  const isOther = choice === OTHER;

  return (
    <div className="space-y-2">
      <Select
        value={choice}
        onChange={(e) => setChoice(e.target.value)}
        required={required && !isOther}
        aria-label={isOther ? undefined : name}
      >
        {includeBlank && <option value="">{blankLabel}</option>}
        {options.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
        <option value={OTHER}>Other…</option>
      </Select>

      {isOther ? (
        <Input
          name={name}
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder={placeholder ?? "Type it"}
          required={required}
          autoFocus
          maxLength={40}
        />
      ) : (
        <input type="hidden" name={name} value={choice} />
      )}
    </div>
  );
}

/* A value no real option could collide with — "Other" itself is a legitimate
   answer for gender, and would otherwise switch the control into typing mode
   every time someone chose it. */
const OTHER = "__other__";

/* ============================================================================
   A file input that looks like a control.

   A bare <input type="file"> renders as the browser's own "Choose File / No
   file chosen" — system text at a system size, in a form where everything
   else is a styled field. It reads as a caption rather than something to
   press, which is exactly how an upload gets missed.

   The native input is still the input; it is only moved out of sight, so
   the label, keyboard focus and form submission all behave normally.
   ========================================================================= */
export function FilePicker({
  name, accept, capture, required, onPick, hint,
}: {
  name: string;
  accept?: string;
  /** "environment" opens the rear camera directly — what reception is holding. */
  capture?: "environment" | "user";
  required?: boolean;
  onPick?: (file: File | null) => void;
  hint?: string;
}) {
  const [picked, setPicked] = useState<string | null>(null);

  return (
    <label className="flex cursor-pointer items-center gap-3">
      <input
        type="file"
        name={name}
        accept={accept}
        capture={capture}
        required={required}
        className="sr-only"
        onChange={(e) => {
          const f = e.target.files?.[0] ?? null;
          setPicked(f?.name ?? null);
          onPick?.(f);
        }}
      />
      <span className="shrink-0 rounded-pill border border-neutral-300 bg-bg px-4 py-2 text-[12.5px] font-semibold text-neutral-800">
        {picked ? "Choose another" : "Choose a file"}
      </span>
      <span className="min-w-0 flex-1 truncate text-[12px] text-neutral-600">
        {picked ?? hint ?? "No file chosen"}
      </span>
    </label>
  );
}

/* ============================================================================
   A URL, or a file from the device.

   Both, side by side, because they answer different questions. A YouTube link
   is right for a three-minute demonstration and this app should not be
   storing that. A photo of the leg press is on the phone in someone's hand,
   and asking them to host it somewhere first is asking them not to bother.

   Uploading fills the URL box, so there is one value and one field name no
   matter which route was taken.
   ========================================================================= */
export function MediaField({
  name, module, defaultValue = "", accept = "image/*", placeholder,
}: {
  name: string;
  /** What the file belongs to; the action checks you may edit it. */
  module: "exercises" | "equipment" | "settings";
  defaultValue?: string;
  accept?: string;
  placeholder?: string;
}) {
  const [url, setUrl] = useState(defaultValue);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File | null) {
    if (!file) return;
    setBusy(true); setError(null);
    const body = new FormData();
    body.set("file", file);
    body.set("module", module);
    const { uploadPublicAsset } = await import("@/lib/actions/media");
    const r = await uploadPublicAsset(body);
    if (r.ok && r.url) setUrl(r.url); else setError(r.error ?? "Upload failed.");
    setBusy(false);
  }

  return (
    <div className="space-y-2">
      <Input
        name={name}
        type="url"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder={placeholder ?? "https://…"}
      />

      <div className="flex items-center gap-3">
        <label className="cursor-pointer">
          <input type="file" accept={accept} className="sr-only"
                 onChange={(e) => void upload(e.target.files?.[0] ?? null)} />
          <span className="inline-block rounded-pill border border-neutral-300 bg-bg px-4 py-2 text-[12.5px] font-semibold text-neutral-800">
            {busy ? "Uploading…" : "Upload from device"}
          </span>
        </label>
        {url && !busy && (
          <button type="button" onClick={() => setUrl("")}
                  className="text-[12px] font-semibold text-accent-700 underline">
            Remove
          </button>
        )}
      </div>

      {error && <p className="text-[12px] text-accent-800">{error}</p>}

      {url && /\.(jpe?g|png|webp|gif)(\?|$)/i.test(url) && (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img src={url} alt="" className="h-20 rounded-md border border-neutral-300" />
      )}
    </div>
  );
}
