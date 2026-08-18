"use client";

import { useState, useTransition } from "react";
import { issueClaimCode } from "@/lib/actions/member-access";
import { formatCode } from "@/lib/auth/code-format";
import { QrCode } from "@/components/ui/qr-code";

/* ============================================================================
   A-11 · App access, on the member's profile.

   The whole onboarding handover, at the counter. Reception taps once, turns
   the screen around, and the member scans. Nothing is sent anywhere, which is
   the point: this gym has no WhatsApp, no SMS and no email.

   The code is shown exactly once — only its digest is stored — so the screen
   keeps it until reception dismisses it rather than losing it on a refresh.
   ========================================================================= */

export function AppAccessCard({
  memberId,
  claimed,
  claimedAt,
  canEdit,
  joinBase,
}: {
  memberId: string;
  claimed: boolean;
  claimedAt: string | null;
  canEdit: boolean;
  /** Absolute origin, so the QR works when scanned by a plain camera app. */
  joinBase: string;
}) {
  const [code, setCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [hidden, setHidden] = useState(false);

  function issue() {
    setError(null);
    start(async () => {
      const r = await issueClaimCode(memberId);
      if (r.ok) setCode(r.message ?? null);
      else setError(r.error);
    });
  }

  if (code) {
    const url = `${joinBase}/join/${code}`;
    return (
      <div className="text-center">
        <p className="mb-3 text-[13px] text-neutral-700">
          Ask them to scan this with their camera.
        </p>

        <div className="relative mx-auto w-fit">
          <div className={hidden ? "blur-md" : ""}>
            <QrCode text={url} size={190} />
          </div>
          {hidden && (
            <button
              type="button"
              onClick={() => setHidden(false)}
              className="absolute inset-0 grid place-items-center text-[12px] font-semibold"
            >
              Tap to show
            </button>
          )}
        </div>

        <p
          className={`mt-3 font-mono text-[30px] font-bold tracking-[0.15em] ${
            hidden ? "blur-md select-none" : ""
          }`}
        >
          {formatCode(code)}
        </p>

        <p className="mt-1 text-[11.5px] text-neutral-600">
          Or open the app and enter the code. Valid 24 hours, works once.
        </p>

        <div className="mt-4 flex justify-center gap-2">
          <button
            type="button"
            onClick={() => setCode(null)}
            className="rounded-pill bg-neutral-900 px-4 py-2 text-[12.5px] font-semibold text-neutral-100"
          >
            Done
          </button>
          <button
            type="button"
            onClick={() => setHidden((h) => !h)}
            className="rounded-pill border border-neutral-300 px-4 py-2 text-[12.5px] font-semibold text-neutral-800"
          >
            {hidden ? "Show" : "Hide"}
          </button>
          <button
            type="button"
            onClick={issue}
            disabled={pending}
            className="rounded-pill border border-neutral-300 px-4 py-2 text-[12.5px] font-semibold text-neutral-800 disabled:opacity-50"
          >
            New code
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-2">
        <span
          className={`h-2 w-2 rounded-pill ${claimed ? "bg-sage-600" : "bg-neutral-400"}`}
          aria-hidden
        />
        <span className="text-[13.5px] font-medium">
          {claimed ? "Linked" : "Not set up"}
        </span>
      </div>

      <p className="mt-1 text-[12px] text-neutral-600">
        {claimed
          ? `Signed up ${claimedAt ? new Date(claimedAt).toLocaleDateString("en-IN") : ""}`
          : "This member cannot open the app or receive reminders."}
      </p>

      {error && <p className="mt-2 text-[12px] text-accent-700">{error}</p>}

      {canEdit && (
        <button
          type="button"
          onClick={issue}
          disabled={pending}
          className="mt-3 rounded-pill bg-neutral-900 px-4 py-2 text-[12.5px] font-semibold text-neutral-100 disabled:opacity-50"
        >
          {pending ? "Working…" : claimed ? "Re-issue code" : "Set up app access"}
        </button>
      )}

      {claimed && canEdit && (
        <p className="mt-2 text-[11.5px] text-neutral-600">
          Re-issuing lets them set a new password. Their history is kept.
        </p>
      )}
    </div>
  );
}
