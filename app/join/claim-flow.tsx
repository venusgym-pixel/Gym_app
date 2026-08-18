"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { claimAccount, type ClaimResult } from "@/lib/actions/member-access";
import { Cta, ErrorNote, Hint, Label, PillInput, Sub, Title } from "@/components/ui/primitives";

/* ============================================================================
   The three steps a member walks through at the counter: prove it is them,
   choose a password, save a recovery code.

   Split across steps rather than one long form because they are doing this
   standing up, on a phone, with someone waiting. One decision per screen.
   ========================================================================= */

export function ClaimFlow({ code }: { code: string }) {
  const router = useRouter();
  const [state, action] = useActionState<ClaimResult | null, FormData>(claimAccount, null);
  const [last4, setLast4] = useState("");
  const [saved, setSaved] = useState(false);

  /* Done: the recovery code exists only in this response — the server kept
     only its digest — so this screen is the single chance to save it. */
  if (state?.ok && state.recoveryCode) {
    return (
      <div className="mt-6">
        <Title>Save this</Title>
        <Sub>
          If you ever forget your password, this gets you back in without
          coming to the gym.
        </Sub>

        <p
          className="mt-5 rounded-lg py-5 text-center font-mono text-[1.6em] font-bold tracking-[0.12em]"
          style={{ background: "var(--color-app-surface)" }}
        >
          {state.recoveryCode}
        </p>

        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={() => navigator.clipboard?.writeText(state.recoveryCode!)}
            className="flex-1 rounded-pill py-3 text-[0.888em] font-semibold"
            style={{ border: "1px solid var(--app-border)" }}
          >
            Copy
          </button>
          <button
            type="button"
            onClick={() =>
              navigator.share?.({ text: `Fitwell recovery code: ${state.recoveryCode}` })
            }
            className="flex-1 rounded-pill py-3 text-[0.888em] font-semibold"
            style={{ border: "1px solid var(--app-border)" }}
          >
            Share
          </button>
        </div>

        <label className="mt-5 flex items-center gap-2.5 text-[0.888em]">
          <input
            type="checkbox"
            checked={saved}
            onChange={(e) => setSaved(e.target.checked)}
            className="h-5 w-5 accent-[var(--color-app-accent)]"
          />
          I&rsquo;ve saved it somewhere safe
        </label>

        {/* Gated on the checkbox: the one thing that makes this screen work is
            that it cannot be skipped by reflex. */}
        <Cta
          className="mt-4"
          disabled={!saved}
          onClick={() => router.replace("/welcome")}
        >
          Continue
        </Cta>
      </div>
    );
  }

  return (
    <form action={action} className="mt-6">
      <input type="hidden" name="code" value={code} />

      <Label>Last 4 digits of your mobile</Label>
      <PillInput
        name="last4"
        inputMode="numeric"
        maxLength={4}
        autoComplete="off"
        value={last4}
        onChange={(e) => setLast4(e.target.value.replace(/\D/g, ""))}
        placeholder="••••"
        required
      />

      <div className="mt-5">
        <Label>Create a password</Label>
        <PillInput
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          placeholder="At least 8 characters"
          required
        />
        <Hint>You&rsquo;ll use your mobile number and this password to sign in.</Hint>
      </div>

      {state && !state.ok && <ErrorNote>{state.error}</ErrorNote>}

      <Cta className="mt-6" type="submit">
        Create account
      </Cta>
    </form>
  );
}
