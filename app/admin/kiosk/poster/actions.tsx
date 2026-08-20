"use client";

import { useState, useTransition } from "react";
import { createOrRotatePoster } from "@/lib/actions/kiosk";

/* Print and reprint. Reprinting is behind a confirm because it is destructive
   in a way that is easy to miss: the sheet already on the wall stops working
   the instant this runs, and if nobody walks over with a new printout, members
   arrive to a code that fails. */
export function PosterActions({
  hasPoster,
  printedAt,
}: {
  hasPoster: boolean;
  printedAt: string | null;
}) {
  const [pending, start] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  function run() {
    setConfirming(false);
    start(async () => {
      const r = await createOrRotatePoster();
      setNote({ ok: r.ok, text: r.ok ? (r.message ?? "Done.") : (r.error ?? "Failed.") });
    });
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        {hasPoster && (
          <button
            type="button"
            onClick={() => window.print()}
            className="rounded-pill bg-neutral-900 px-5 py-2 text-[12.5px] font-semibold text-neutral-100 hover:bg-neutral-800"
          >
            Print this sheet
          </button>
        )}

        {!hasPoster ? (
          <button
            type="button"
            disabled={pending}
            onClick={run}
            className="rounded-pill bg-neutral-900 px-5 py-2 text-[12.5px] font-semibold text-neutral-100 disabled:opacity-40"
          >
            {pending ? "Working…" : "Create the poster"}
          </button>
        ) : confirming ? (
          <>
            <button
              type="button"
              disabled={pending}
              onClick={run}
              className="rounded-pill bg-accent-600 px-4 py-2 text-[12.5px] font-semibold text-neutral-100 disabled:opacity-40"
            >
              Yes, retire the old sheet
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="rounded-pill border border-neutral-300 px-4 py-2 text-[12.5px] font-semibold"
            >
              Cancel
            </button>
          </>
        ) : (
          <button
            type="button"
            disabled={pending}
            onClick={() => setConfirming(true)}
            className="rounded-pill border border-neutral-300 px-4 py-2 text-[12.5px] font-semibold text-neutral-800"
          >
            Print a new one
          </button>
        )}
      </div>

      {confirming && (
        <p className="mt-2 max-w-[62ch] text-[12.5px] text-accent-800">
          The sheet on the wall stops working immediately. Have the printer
          ready before you do this, or members will scan a dead code.
        </p>
      )}

      {printedAt && !confirming && (
        <p className="mt-2 text-[12px] text-neutral-600">
          Current code created {new Date(printedAt).toLocaleDateString("en-IN")}.
        </p>
      )}

      {note && (
        <p
          role="status"
          className={`mt-3 max-w-[62ch] rounded-md px-3 py-2 text-[12.5px] ${
            note.ok ? "bg-sage-200 text-sage-800" : "bg-accent-200 text-accent-800"
          }`}
        >
          {note.text}
        </p>
      )}
    </div>
  );
}
