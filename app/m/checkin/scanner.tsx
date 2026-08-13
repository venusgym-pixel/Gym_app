"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Cta, Screen } from "@/components/ui/primitives";

/* ============================================================================
   M-07 / M-09 / M-10 · Scan, and what happens next.

   One component for all three states because they are one moment: the member
   is standing at the door and needs an answer. Routing between screens would
   put a navigation between the scan and the answer.

   BarcodeDetector is used where available (Chrome, Android) and the manual
   entry field is the fallback everywhere else — notably iOS Safari, which
   still has no BarcodeDetector. A camera that silently does nothing on
   iPhone would strand a large share of members, so the fallback is visible
   from the start rather than hidden behind a failure.
   ========================================================================= */

interface CheckinResponse {
  outcome: "ok" | "duplicate" | "expired" | "frozen" | "none" | string;
  memberName: string | null;
  status: string | null;
  expiresOn: string | null;
  daysLeft: number | null;
  streak: number;
  visitsThisMonth: number;
}

type BarcodeDetectorLike = {
  detect: (source: CanvasImageSource) => Promise<{ rawValue: string }[]>;
};

export function Scanner() {
  const video = useRef<HTMLVideoElement>(null);
  const [result, setResult] = useState<CheckinResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [manual, setManual] = useState("");
  const [cameraOn, setCameraOn] = useState(false);
  const submitted = useRef(false);

  async function submit(token: string) {
    if (submitted.current) return;
    submitted.current = true;
    setBusy(true);
    setError(null);

    try {
      const res = await fetch("/api/checkin", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, idempotencyKey: crypto.randomUUID() }),
      });
      const data = (await res.json()) as CheckinResponse & { reason?: string };

      if (!res.ok && !["expired", "frozen", "none"].includes(data.outcome)) {
        setError(
          data.outcome === "invalid-code"
            ? "That code has expired. The screen at reception refreshes every 30 seconds — try again."
            : "Could not check you in. Ask reception.",
        );
        submitted.current = false;
      } else {
        setResult(data);
      }
    } catch {
      setError("No connection. Your check-in will sync when you are back online.");
      submitted.current = false;
    } finally {
      setBusy(false);
    }
  }

  /* Camera + detection loop. Torn down on unmount so the indicator light
     does not stay on after the member navigates away. */
  useEffect(() => {
    let stream: MediaStream | null = null;
    let raf = 0;
    let alive = true;

    async function start() {
      const Detector = (
        window as unknown as { BarcodeDetector?: new (o: object) => BarcodeDetectorLike }
      ).BarcodeDetector;
      if (!Detector || !navigator.mediaDevices?.getUserMedia) return;

      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });
        if (!alive) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        if (video.current) {
          video.current.srcObject = stream;
          await video.current.play();
          setCameraOn(true);
        }

        const detector = new Detector({ formats: ["qr_code"] });
        const tick = async () => {
          if (!alive || !video.current || submitted.current) return;
          try {
            const codes = await detector.detect(video.current);
            if (codes[0]?.rawValue) {
              void submit(codes[0].rawValue);
              return;
            }
          } catch {
            /* a frame that fails to decode is normal; keep looping */
          }
          raf = requestAnimationFrame(() => void tick());
        };
        raf = requestAnimationFrame(() => void tick());
      } catch {
        // Permission denied or no camera — the manual field still works.
        setCameraOn(false);
      }
    }

    void start();
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  if (result) return <Outcome result={result} />;

  return (
    <Screen className="pb-32">
      <h1 className="text-[24px]">Check in</h1>

      <div
        className="relative mx-auto mt-8 grid aspect-square w-full max-w-[280px] place-items-center overflow-hidden rounded-lg"
        style={{ background: "var(--color-app-surface-2)" }}
      >
        <video
          ref={video}
          playsInline
          muted
          className="h-full w-full object-cover"
          style={{ display: cameraOn ? "block" : "none" }}
        />
        {!cameraOn && (
          <span className="text-[11px]" style={{ color: "var(--app-ink-35)" }}>
            camera unavailable
          </span>
        )}
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className="pointer-events-none absolute h-13 w-13"
            style={{
              width: 52, height: 52,
              top: i < 2 ? 0 : undefined, bottom: i >= 2 ? 0 : undefined,
              left: i % 2 === 0 ? 0 : undefined, right: i % 2 === 1 ? 0 : undefined,
              borderTop: i < 2 ? "4px solid var(--color-app-accent)" : undefined,
              borderBottom: i >= 2 ? "4px solid var(--color-app-accent)" : undefined,
              borderLeft: i % 2 === 0 ? "4px solid var(--color-app-accent)" : undefined,
              borderRight: i % 2 === 1 ? "4px solid var(--color-app-accent)" : undefined,
              borderRadius:
                i === 0 ? "24px 0 0 0" : i === 1 ? "0 24px 0 0"
                : i === 2 ? "0 0 0 24px" : "0 0 24px 0",
            }}
            aria-hidden
          />
        ))}
      </div>

      <p className="mt-7 text-center text-[14px]" style={{ color: "rgb(249 244 237 / 0.65)" }}>
        {busy ? "Checking you in…" : "Point at the code on the reception counter"}
      </p>

      {error && (
        <p
          role="alert"
          className="mt-4 rounded-md px-4 py-3 text-center text-[12.5px]"
          style={{ background: "rgb(246 160 107 / 0.12)", color: "var(--color-app-accent)" }}
        >
          {error}
        </p>
      )}

      <div className="mt-auto pt-8">
        <p className="mb-2 text-[11.5px]" style={{ color: "var(--app-ink-50)" }}>
          Camera not working? Type the code shown under the QR.
        </p>
        <div className="flex gap-2">
          <input
            value={manual}
            onChange={(e) => setManual(e.target.value.trim())}
            placeholder="fw1.…"
            aria-label="Check-in code"
            className="min-w-0 flex-1 rounded-pill px-4 py-3 text-[14px] outline-none"
            style={{
              background: "var(--color-app-surface)",
              border: "1px solid var(--app-border)",
              color: "var(--color-app-ink)",
            }}
          />
          <Cta
            className="!w-auto px-6"
            disabled={!manual || busy}
            onClick={() => void submit(manual)}
          >
            Go
          </Cta>
        </div>
      </div>
    </Screen>
  );
}

/* ── M-09 / M-10 ──────────────────────────────────────────────────────────── */

function Outcome({ result }: { result: CheckinResponse }) {
  const good = result.outcome === "ok" || result.outcome === "duplicate";

  const copy: Record<string, { title: string; body: string }> = {
    ok: { title: "You're in", body: "Have a good session." },
    duplicate: { title: "Already checked in", body: "We have you down for today." },
    expired: {
      title: "Membership expired",
      body: "Renew to check in. Reception can take payment, or renew in the app.",
    },
    frozen: {
      title: "Membership frozen",
      body: "Your membership is paused. Reception can unfreeze it.",
    },
    none: { title: "No membership on file", body: "Please see reception." },
  };

  const c = copy[result.outcome] ?? copy.none;

  return (
    <>
      <Screen center className="pb-32">
        <div
          className="grid h-30 w-30 place-items-center rounded-pill"
          style={{
            width: 120, height: 120,
            background: good ? "var(--app-good-soft)" : "rgb(246 160 107 / 0.14)",
          }}
        >
          {good ? (
            <div
              className="grid place-items-center rounded-pill"
              style={{ width: 84, height: 84, background: "var(--color-app-good)" }}
            >
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none"
                   stroke="var(--color-app-accent-ink)" strokeWidth="3.2" strokeLinecap="round">
                <path d="M5 13l4 4L19 7" />
              </svg>
            </div>
          ) : (
            <svg width="52" height="52" viewBox="0 0 24 24" fill="none"
                 stroke="var(--color-app-accent)" strokeWidth="2.75" strokeLinecap="round">
              <path d="M12 8v5M12 17h.01" />
              <circle cx="12" cy="12" r="9" />
            </svg>
          )}
        </div>

        <h1 className="mt-7 text-[30px]">{c.title}</h1>
        <p className="mt-2 max-w-[290px] text-[13.5px]" style={{ color: "var(--app-ink-60)" }}>
          {c.body}
        </p>

        {good && (
          <div className="mt-8 flex w-full gap-3">
            <Panel value={result.streak} label="day streak" accent />
            <Panel value={result.visitsThisMonth} label="visits this month" />
          </div>
        )}

        {!good && (
          <Link
            href="/m/membership"
            className="mt-8 w-full rounded-pill bg-app-accent py-4 text-center text-[16px] font-bold text-app-accent-ink"
          >
            See my membership
          </Link>
        )}

        <Link
          href="/m"
          className="mt-4 text-[12.5px] font-semibold text-app-accent"
        >
          Back to home
        </Link>
      </Screen>
      <MemberTabBarClient />
    </>
  );
}

function Panel({ value, label, accent }: { value: number; label: string; accent?: boolean }) {
  return (
    <div
      className="flex-1 rounded-lg p-4"
      style={{ background: accent ? "var(--app-streak)" : "var(--color-app-surface)" }}
    >
      <div
        className="text-[38px] leading-none font-bold tracking-[-0.02em]"
        style={{ color: accent ? "#fff" : undefined }}
      >
        {value}
      </div>
      <div
        className="mt-1 text-[11.5px]"
        style={{ color: accent ? "rgb(255 255 255 / 0.8)" : "var(--app-ink-55)" }}
      >
        {label}
      </div>
    </div>
  );
}

/* The tab bar is a server component elsewhere; here it is only needed for
   layout parity after a result, so render the same markup client-side. */
function MemberTabBarClient() {
  return <div style={{ height: 96 }} aria-hidden />;
}
