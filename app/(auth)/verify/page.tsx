"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createBrowserDb } from "@/lib/db/client";
import { Cta, ErrorNote, Screen, Sub, Title } from "@/components/ui/primitives";

/* ============================================================================
   S-03 · OTP verification

   Six boxes and an on-screen keypad, matching the prototype. The keypad is
   deliberate: it is faster than the system keyboard for digits, and it keeps
   the layout from jumping when the keyboard opens over a short screen.

   A hidden input keeps hardware keyboards and SMS autofill working — on iOS
   the one-time-code autofill only fires for a real input with that
   autocomplete hint.
   ========================================================================= */

const RESEND_SECONDS = 30;
const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "del"] as const;

function VerifyInner() {
  const router = useRouter();
  const params = useSearchParams();
  const phone = params.get("phone") ?? "";
  const next = params.get("next");

  const [code, setCode] = useState("");
  const [resend, setResend] = useState(RESEND_SECONDS);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hidden = useRef<HTMLInputElement>(null);
  const submitted = useRef(false);

  useEffect(() => {
    if (resend <= 0) return;
    const t = setInterval(() => setResend((s) => (s <= 1 ? 0 : s - 1)), 1000);
    return () => clearInterval(t);
  }, [resend]);

  const verify = useCallback(
    async (token: string) => {
      setBusy(true);
      setError(null);

      const db = createBrowserDb();
      const { error: err } = await db.auth.verifyOtp({ phone, token, type: "sms" });
      setBusy(false);

      if (err) {
        setError("That code didn't work. Check it, or resend.");
        setCode("");
        return;
      }

      router.replace(next ?? "/");
      router.refresh();
    },
    [phone, next, router],
  );

  /* Auto-submit on the sixth digit. The ref guard stops a double submission
     when React re-renders between the state update and the redirect. */
  useEffect(() => {
    if (code.length === 6 && !submitted.current) {
      submitted.current = true;
      void verify(code);
    }
    if (code.length < 6) submitted.current = false;
  }, [code, verify]);

  function press(key: string) {
    setError(null);
    if (key === "del") return setCode((c) => c.slice(0, -1));
    if (key === "") return;
    setCode((c) => (c + key).slice(0, 6));
  }

  async function resendCode() {
    if (resend > 0) return;
    setError(null);
    const db = createBrowserDb();
    const { error: err } = await db.auth.signInWithOtp({ phone });
    if (err) setError(err.message);
    else setResend(RESEND_SECONDS);
  }

  const pretty = phone.replace(/^\+91(\d{5})(\d{5})$/, "+91 $1 $2");

  return (
    <Screen>
      <button
        type="button"
        onClick={() => router.back()}
        className="self-start text-[13px]"
        style={{ color: "var(--app-ink-55)" }}
      >
        ← Change number
      </button>

      <Title className="mt-6">Enter the code</Title>
      <Sub>Sent to {pretty || "your phone"}</Sub>

      {/* Real input, visually hidden: keeps SMS autofill and hardware
          keyboards working while the visible UI stays custom. */}
      <input
        ref={hidden}
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
        inputMode="numeric"
        autoComplete="one-time-code"
        aria-label="Verification code"
        className="absolute h-px w-px opacity-0"
      />

      <button
        type="button"
        onClick={() => hidden.current?.focus()}
        className="mt-8 mb-[14px] flex w-full gap-[9px]"
        aria-label="Verification code entry"
      >
        {Array.from({ length: 6 }, (_, i) => (
          <span
            key={i}
            className="grid h-[60px] flex-1 place-items-center rounded-md text-[24px] font-bold"
            style={{
              border: code.length === i
                ? "2px solid var(--color-app-accent)"
                : "1px solid var(--app-border-strong)",
              background: code[i] ? "rgb(246 160 107 / 0.12)" : "transparent",
            }}
          >
            {code[i] ?? ""}
          </span>
        ))}
      </button>

      <button
        type="button"
        onClick={resendCode}
        disabled={resend > 0}
        className="self-start text-[12.5px] disabled:cursor-default"
        style={{ color: resend > 0 ? "var(--app-ink-45)" : "var(--color-app-accent)" }}
      >
        {resend > 0
          ? `Resend code in 0:${String(resend).padStart(2, "0")}`
          : "Resend code now"}
      </button>

      <ErrorNote>{error}</ErrorNote>

      <div className="mt-auto grid grid-cols-3 gap-3 pt-8">
        {KEYS.map((k, i) => (
          <button
            key={i}
            type="button"
            disabled={k === "" || busy}
            onClick={() => press(k)}
            aria-label={k === "del" ? "Delete" : k || undefined}
            className="grid h-[62px] place-items-center rounded-md text-[24px] transition-colors disabled:pointer-events-none"
            style={{ background: k === "" ? "transparent" : "var(--color-app-surface)" }}
          >
            {k === "del" ? "⌫" : k}
          </button>
        ))}
      </div>

      {busy && (
        <Cta className="mt-4" disabled loading>
          Verifying
        </Cta>
      )}
    </Screen>
  );
}

export default function VerifyPage() {
  /* useSearchParams needs a Suspense boundary to keep the route statically
     shell-rendered rather than forcing the whole page dynamic. */
  return (
    <Suspense fallback={<Screen center><Title>Loading</Title></Screen>}>
      <VerifyInner />
    </Suspense>
  );
}
