"use client";

import { useFormStatus } from "react-dom";
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
