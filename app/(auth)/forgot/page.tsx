"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { resetWithRecoveryCode, type ClaimResult } from "@/lib/actions/member-access";
import {
  Cta, ErrorNote, Hint, Label, PillInput, Screen, Sub, Title,
} from "@/components/ui/primitives";

/* ============================================================================
   S-08 · Forgot password, with no channel to send a link down.

   The member proves themselves with the recovery code shown once when they
   claimed the account. That is the whole point of issuing one: without it,
   a forgotten password means a trip to the gym, and the design promised
   reception would be needed exactly once.

   A fresh code is issued on success — spending the old one without replacing
   it would leave them one forgotten password away from the desk again.
   ========================================================================= */

export default function ForgotPage() {
  const router = useRouter();
  const [state, action] = useActionState<ClaimResult | null, FormData>(
    resetWithRecoveryCode,
    null,
  );
  const [saved, setSaved] = useState(false);

  if (state?.ok && state.recoveryCode) {
    return (
      <Screen>
        <Title>You&rsquo;re back in</Title>
        <Sub>Here is a new recovery code. The old one has been used up.</Sub>

        <p
          className="mt-5 rounded-lg py-5 text-center font-mono text-[1.6em] font-bold tracking-[0.12em]"
          style={{ background: "var(--color-app-surface)" }}
        >
          {state.recoveryCode}
        </p>

        <button
          type="button"
          onClick={() => navigator.clipboard?.writeText(state.recoveryCode!)}
          className="mt-3 w-full rounded-pill py-3 text-[0.888em] font-semibold"
          style={{ border: "1px solid var(--app-border)" }}
        >
          Copy
        </button>

        <label className="mt-5 flex items-center gap-2.5 text-[0.888em]">
          <input
            type="checkbox"
            checked={saved}
            onChange={(e) => setSaved(e.target.checked)}
            className="h-5 w-5 accent-[var(--color-app-accent)]"
          />
          I&rsquo;ve saved it
        </label>

        <Cta className="mt-4" disabled={!saved} onClick={() => router.replace("/m")}>
          Continue
        </Cta>
      </Screen>
    );
  }

  return (
    <Screen>
      <Title className="mt-6">Forgot password</Title>
      <Sub>Use the recovery code you saved when you set up the app.</Sub>

      <form action={action} className="mt-6 flex flex-col gap-4">
        <label className="block">
          <Label>Mobile number</Label>
          <PillInput
            name="phone"
            prefix="+91"
            type="tel"
            inputMode="numeric"
            autoComplete="tel-national"
            placeholder="98450 21764"
            maxLength={13}
            required
          />
        </label>

        <label className="block">
          <Label>Recovery code</Label>
          <PillInput
            name="code"
            autoCapitalize="characters"
            autoComplete="off"
            placeholder="R4T9-KM2P"
            className="font-mono tracking-[0.12em] uppercase"
            required
          />
        </label>

        <label className="block">
          <Label>New password</Label>
          <PillInput
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            placeholder="At least 8 characters"
            required
          />
        </label>

        {state && !state.ok && <ErrorNote>{state.error}</ErrorNote>}

        <Cta className="mt-2" type="submit">
          Reset password
        </Cta>
      </form>

      <Hint>
        Lost the code too? The front desk can set you up again in a moment —
        your history is kept.
      </Hint>

      <p className="mt-auto pt-8 text-center text-[0.822em]">
        <Link href="/login" style={{ color: "var(--app-ink-45)" }}>
          Back to sign in
        </Link>
      </p>
    </Screen>
  );
}
