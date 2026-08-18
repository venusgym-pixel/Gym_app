"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { memberAuthEmail } from "@/lib/auth/code-format";
import { createBrowserDb } from "@/lib/db/client";
import {
  Cta, ErrorNote, Label, Logo, PillInput, Screen, Segmented, Sub, Title,
} from "@/components/ui/primitives";

/* ============================================================================
   S-02 · Login

   One login for every role. Which app you land in comes from your account,
   never from a tab you pick — otherwise the screen tells an attacker which
   identifiers are staff accounts.

   OTP is the default because most members are created at reception and have
   no password. Staff use email + password.
   ========================================================================= */

const MODES = ["Member", "Staff"] as const;
type Mode = (typeof MODES)[number];

/** 10 digits, first one 6-9 — the Indian mobile range. */
function normalisePhone(input: string): string | null {
  const digits = input.replace(/\D/g, "").replace(/^91/, "");
  return /^[6-9]\d{9}$/.test(digits) ? `+91${digits}` : null;
}

function LoginInner() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next");

  const [mode, setMode] = useState<Mode>("Member");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Members sign in with the number reception typed when it created them.
   *
   * Supabase needs an email, and members have none, so the phone maps to a
   * synthetic address they never see. Phone logins would avoid the mapping
   * but require enabling an SMS provider — the exact dependency this whole
   * onboarding design exists to avoid.
   */
  async function memberSignIn() {
    const e164 = normalisePhone(phone);
    if (!e164) {
      setError("Enter a 10-digit mobile number.");
      return;
    }

    setBusy(true);
    setError(null);
    const db = createBrowserDb();
    const { error: err } = await db.auth.signInWithPassword({
      email: memberAuthEmail(e164),
      password,
    });
    setBusy(false);

    if (err) {
      // Never confirm whether a number is registered.
      setError("That number and password didn't match.");
      return;
    }

    router.replace(next ?? "/");
    router.refresh();
  }

  async function signIn() {
    setBusy(true);
    setError(null);
    const db = createBrowserDb();
    const { error: err } = await db.auth.signInWithPassword({ email, password });
    setBusy(false);

    if (err) {
      // Deliberately vague: never confirm whether an address is registered.
      setError("Those details didn't match. Check and try again.");
      return;
    }

    // Middleware reads the fresh session and routes by role.
    router.replace(next ?? "/");
    router.refresh();
  }

  const member = mode === "Member";

  return (
    <Screen>
      <div className="pt-6">
        <Logo />
      </div>

      <Title className="mt-7 text-[32px] leading-[1.1]">Welcome back</Title>
      <Sub className="max-w-[280px]">
        One login for members, trainers and staff — your role comes from your
        account.
      </Sub>

      <Segmented
        className="my-6"
        options={MODES}
        value={mode}
        onChange={(m) => { setMode(m); setError(null); }}
      />

      <form
        onSubmit={(e) => { e.preventDefault(); void (member ? memberSignIn() : signIn()); }}
      >
        {member ? (
          <div className="flex flex-col gap-4">
            <label className="block">
              <Label>Mobile number</Label>
              <PillInput
                prefix="+91"
                type="tel"
                inputMode="numeric"
                autoComplete="tel-national"
                placeholder="98450 21764"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                maxLength={13}
              />
            </label>
            <label className="block">
              <Label>Password</Label>
              <PillInput
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <label className="block">
              <Label>Email</Label>
              <PillInput
                type="email"
                autoComplete="email"
                placeholder="you@gym.in"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <label className="block">
              <Label>Password</Label>
              <PillInput
                type="password"
                autoComplete="current-password"
                placeholder="••••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
          </div>
        )}

        <p className="mt-[10px] text-[11.5px]" style={{ color: "var(--app-ink-40)" }}>
          {member
            ? "The number the gym has for you, and the password you set."
            : "Staff accounts sign in with email."}
        </p>

        <ErrorNote>{error}</ErrorNote>

        <Cta className="mt-6" type="submit" loading={busy}>
          Sign in
        </Cta>
      </form>

      {member && (
        <p className="mt-5 text-center text-[0.855em]">
          <Link href="/forgot" className="text-app-accent">
            Forgot password?
          </Link>
        </p>
      )}

      <p
        className="mt-auto pt-8 text-center text-[12.5px]"
        style={{ color: "var(--app-ink-45)" }}
      >
        New here? Ask reception to set up your app access.
      </p>
    </Screen>
  );
}

export default function LoginPage() {
  /* useSearchParams reads the ?next= redirect target, so it needs a Suspense
     boundary — without one the whole route opts out of static rendering. */
  return (
    <Suspense
      fallback={
        <Screen>
          <div className="pt-6"><Logo /></div>
          <Title className="mt-7 text-[32px] leading-[1.1]">Welcome back</Title>
        </Screen>
      }
    >
      <LoginInner />
    </Suspense>
  );
}
