"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserDb } from "@/lib/db/client";
import { Cta, ErrorNote, Label, PillInput, Screen, Sub, Title } from "@/components/ui/primitives";

/* ============================================================================
   S-04 · Set password (staff)

   Staff sign in with a password; members keep using OTP. Reached from the
   invite link reception sends, and from a password reset.
   ========================================================================= */

/** Deliberately simple and honest: length is what actually matters, so the
 *  meter rewards it rather than demanding a symbol nobody remembers. */
function strengthOf(pw: string): { score: number; label: string } {
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/\d/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  const label = ["Too short", "Weak", "Fair", "Strong", "Very strong"][score];
  return { score, label };
}

export default function SetPasswordPage() {
  const router = useRouter();
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const strength = strengthOf(pw);
  const tooWeak = pw.length < 8;
  const mismatch = confirm.length > 0 && pw !== confirm;

  async function save() {
    if (tooWeak) return setError("Use at least 8 characters.");
    if (pw !== confirm) return setError("The two passwords don’t match.");

    setBusy(true);
    setError(null);
    const db = createBrowserDb();
    const { error: err } = await db.auth.updateUser({ password: pw });
    setBusy(false);

    if (err) return setError(err.message);
    router.replace("/");
    router.refresh();
  }

  return (
    <Screen>
      <Title className="mt-6">Set a password</Title>
      <Sub className="max-w-[290px]">
        Staff accounts sign in with a password. Members can keep using OTP.
      </Sub>

      <form
        className="mt-7 flex flex-col gap-4"
        onSubmit={(e) => { e.preventDefault(); void save(); }}
      >
        <label className="block">
          <Label>New password</Label>
          <PillInput
            type="password"
            autoComplete="new-password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            placeholder="••••••••••"
          />
        </label>

        <label className="block">
          <Label>Confirm password</Label>
          <PillInput
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="••••••••••"
          />
        </label>

        <div>
          <div className="flex gap-[6px]" aria-hidden>
            {[0, 1, 2, 3].map((i) => (
              <span
                key={i}
                className="h-[5px] flex-1 rounded-pill transition-colors"
                style={{
                  background: i < strength.score
                    ? "var(--color-app-good)"
                    : "rgb(249 244 237 / 0.15)",
                }}
              />
            ))}
          </div>
          <p
            className="mt-[9px] text-[12px]"
            style={{ color: strength.score >= 3 ? "var(--color-app-good)" : "var(--app-ink-50)" }}
            aria-live="polite"
          >
            {pw ? strength.label : "At least 8 characters"}
          </p>
        </div>

        <ErrorNote>{error ?? (mismatch ? "The two passwords don’t match." : null)}</ErrorNote>

        <Cta pinned type="submit" loading={busy} disabled={tooWeak || mismatch || !confirm}>
          Save password
        </Cta>
      </form>
    </Screen>
  );
}
