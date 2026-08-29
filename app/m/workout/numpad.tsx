"use client";

import { useState } from "react";

/* ============================================================================
   The number pad, as a bottom sheet.

   It replaces a pair of steppers, which were the wrong control for this job.
   Nielsen Norman's guidance on input steppers is that they suit small
   adjustments around a common default, and break down for wide ranges and
   high variability — which is exactly weight in kilos. Going from a 60kg
   default to 82.5kg cost nine taps at 2.5kg a time. Typing it costs four,
   and the common case now costs none at all, because the row arrives
   prefilled from last session.

   Not the OS keyboard, deliberately. A custom pad means keys big enough for
   a sweaty thumb, no autocorrect bar stealing a third of the screen, and
   room for the ±2.5 buttons that make the small adjustment case one tap —
   which is what the steppers were genuinely good at, kept where it belongs.

   Sits in the bottom half of the screen, inside the thumb's reach on a large
   phone: roughly three quarters of all phone interaction is thumb-driven,
   and the numbers being edited are the ones the whole session hangs on.
   ========================================================================= */

export function NumPad({
  title,
  unit,
  initial,
  decimals,
  onCommit,
  onClose,
}: {
  /** The exercise and which set, so the sheet says what it is editing. */
  title: string;
  unit: string;
  initial: number;
  /** Weight takes a half; reps do not. */
  decimals: boolean;
  onCommit: (value: number) => void;
  onClose: () => void;
}) {
  /* Held as a string while editing, so a half-typed "82." is a legal state.
     Committing parses it once, at the end. */
  const [text, setText] = useState(() => {
    const s = String(initial ?? 0);
    return s === "0" ? "" : s;
  });

  const shown = text === "" ? "0" : text;
  const parsed = Number(shown);
  const valid = Number.isFinite(parsed) && parsed >= 0;

  function push(ch: string) {
    setText((t) => {
      if (ch === "." ) {
        if (!decimals || t.includes(".")) return t;
        return t === "" ? "0." : t + ".";
      }
      /* A cap rather than a validator: nobody presses 1000kg, and a runaway
         string is how you end up with a set logged at 999999. */
      const next = t + ch;
      if (next.replace(".", "").length > 6) return t;
      return next;
    });
  }

  function bump(by: number) {
    const base = Number.isFinite(parsed) ? parsed : 0;
    const next = Math.max(0, Math.round((base + by) * 100) / 100);
    setText(String(next));
  }

  return (
    <>
      {/* Tapping away commits nothing and closes — the same as Cancel. An
          accidental dismissal must never write a number. */}
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="numpad-scrim fixed inset-0 z-40"
        style={{ background: "rgb(0 0 0 / 0.5)" }}
      />

      <div
        role="dialog"
        aria-label={title}
        className="numpad-sheet app-scale fixed inset-x-0 bottom-0 z-50 mx-auto max-w-[29em] rounded-t-2xl px-[1em] pt-[0.9em]"
        style={{
          background: "var(--color-app-bg-tabbar)",
          paddingBottom: "max(1.2em, env(safe-area-inset-bottom, 0px))",
          borderTop: "1px solid var(--app-hairline)",
        }}
      >
        <div className="flex items-baseline justify-between">
          <span className="text-[0.822em]" style={{ color: "var(--app-ink-55)" }}>
            {title}
          </span>
          <span className="text-[1.579em] font-bold tabular">
            {shown}
            <span className="ml-1 text-[0.5em]" style={{ color: "var(--app-ink-45)" }}>
              {unit}
            </span>
          </span>
        </div>

        {decimals && (
          <div className="mt-2.5 flex gap-2">
            {[-5, -2.5, 2.5, 5].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => bump(n)}
                className="flex-1 rounded-md py-2 text-[0.822em] font-semibold"
                style={{ background: "var(--app-fill)", color: "var(--color-app-ink)" }}
              >
                {n > 0 ? `+${n}` : n}
              </button>
            ))}
          </div>
        )}

        <div className="mt-2.5 grid grid-cols-3 gap-2">
          {["1","2","3","4","5","6","7","8","9", decimals ? "." : "", "0", "⌫"].map((k, i) =>
            k === "" ? (
              <span key={i} />
            ) : (
              <button
                key={i}
                type="button"
                onClick={() => (k === "⌫" ? setText((t) => t.slice(0, -1)) : push(k))}
                /* 64px keys. Bigger than the 48dp floor because this is being
                   pressed with a wet thumb between sets. */
                className="numpad-key rounded-md text-[1.184em] font-semibold select-none"
                style={{
                  height: 64,
                  background: k === "⌫" ? "transparent" : "var(--app-fill)",
                  color: "var(--color-app-ink)",
                }}
              >
                {k}
              </button>
            ),
          )}
        </div>

        <div className="mt-2.5 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-pill py-3 text-[0.921em] font-semibold"
            style={{ background: "var(--app-fill)", color: "var(--color-app-ink)" }}
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!valid}
            onClick={() => onCommit(parsed)}
            className="flex-[2] rounded-pill bg-app-accent py-3 text-[0.987em] font-bold text-app-accent-ink disabled:opacity-40"
          >
            Done
          </button>
        </div>
      </div>
    </>
  );
}
