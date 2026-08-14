"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Cta, Screen } from "@/components/ui/primitives";

/* ============================================================================
   M-07 / M-09 / M-10 · Scan, and what happens next.

   One component for all three states because they are one moment: the member
   is standing at the door and needs an answer. Routing between screens would
   put a navigation between the scan and the answer.

   Two QR decoders: the native BarcodeDetector where it exists (Chrome and
   Edge) and jsQR over canvas frames everywhere else. Safari and Firefox have
   never shipped BarcodeDetector, and iPhone Safari is a large share of gym
   members — so the camera has to work without it, not fall back to typing.

   The manual code field stays visible regardless, because cameras get
   declined, and a member at the door needs a way in either way.
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
  const [cameraReason, setCameraReason] = useState<string | null>(null);
  /* Bumping this re-runs the camera effect. A failed camera used to be a
     dead end — the only recovery was reloading the page, which on an
     installed app means closing and reopening it. */
  const [attempt, setAttempt] = useState(0);
  const canvas = useRef<HTMLCanvasElement>(null);
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

  /*
    Camera + decode loop.

    Two decoders, because BarcodeDetector — the fast native one — exists only
    in Chrome and Edge. Safari and Firefox have never shipped it, and iPhone
    Safari is a large share of gym members. The first version bailed out
    entirely when it was missing, so the camera never even turned on for those
    users; jsQR now decodes canvas frames wherever the native API is absent.

    getUserMedia additionally requires a SECURE CONTEXT. Over plain http on a
    LAN address the browser refuses without explaining why, so that case is
    detected up front and said out loud rather than looking like a dead camera.
  */
  useEffect(() => {
    let stream: MediaStream | null = null;
    let raf = 0;
    let alive = true;

    /* Every branch that sets state lives inside start(), so the effect body
       itself never calls setState synchronously — that would queue an extra
       render before the first paint. */
    async function start() {
      if (!window.isSecureContext) {
        setCameraReason(
          "Cameras only work over https. Open this on an https:// address (or localhost) — or type the code below.",
        );
        return;
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraReason("This browser cannot open the camera. Type the code below.");
        return;
      }

      try {
        /* getUserMedia can hang forever rather than rejecting — another app
           holding the camera, a permission prompt that never appears, some
           Android WebViews. Without this race the screen sits on "Starting
           camera…" indefinitely with no error and no way out, which is
           indistinguishable from the app being broken. Ten seconds is long
           enough for a slow phone to wake its camera and short enough that
           nobody stands at the door wondering. */
        stream = await Promise.race([
          navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: "environment" } },
          }),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new DOMException("timeout", "TimeoutError")), 10_000),
          ),
        ]);
      } catch (e) {
        const name = (e as DOMException)?.name ?? "Error";

        /* An installed app has no address bar, so "allow it in your browser
           settings" is advice the member cannot act on. Nor is it an Android
           app permission: a PWA installed by Chrome is a WebAPK, and the
           camera grant lives in CHROME's per-site settings — which is why
           looking under Settings → Apps → Fitwell → Permissions turns up
           nothing at all. Once Chrome has a denial recorded it rejects
           instantly and never prompts again, so that screen is the only way
           back. */
        const standalone =
          window.matchMedia("(display-mode: standalone)").matches ||
          (window.navigator as unknown as { standalone?: boolean }).standalone === true;

        const message =
          name === "NotAllowedError"
            ? standalone
              ? "Camera permission is off. In the Chrome app: ⋮ → Settings → Site settings → Camera → allow this site, then come back and tap Try again."
              : "Camera permission was declined. Tap the icon at the left of the address bar → Permissions → Camera → Allow, then tap Try again."
            : name === "NotFoundError"
              ? "No camera found on this device. Type the code below."
              : name === "NotReadableError"
                ? "Another app is using the camera. Close it and tap Try again."
                : name === "TimeoutError"
                  ? "The camera did not start. Tap Try again, or type the code below."
                  : "Could not open the camera. Type the code below.";
        /* The error NAME is appended deliberately. Every friendly message
           above reads the same in a screenshot, and "camera not working" with
           no detail cost a long round of guessing once already. */
        setCameraReason(`${message} (${name})`);
        return;
      }

      if (!alive) { stream.getTracks().forEach((t) => t.stop()); return; }

      const el = video.current;
      if (!el) {
        /* Previously returned silently, leaving "Starting camera…" on screen
           forever with the stream still open behind it. */
        stream.getTracks().forEach((t) => t.stop());
        setCameraReason("The camera preview could not be attached. Tap Try again.");
        return;
      }
      el.srcObject = stream;
      try { await el.play(); } catch { /* autoplay race — the loop retries */ }
      setCameraOn(true);
      setCameraReason(null);

      const Detector = (
        window as unknown as { BarcodeDetector?: new (o: object) => BarcodeDetectorLike }
      ).BarcodeDetector;
      const native = Detector ? new Detector({ formats: ["qr_code"] }) : null;

      const tick = async () => {
        if (!alive || submitted.current) return;
        const v = video.current;

        if (v && v.readyState >= 2 && v.videoWidth > 0) {
          let found: string | null = null;

          if (native) {
            try {
              const codes = await native.detect(v);
              found = codes[0]?.rawValue ?? null;
            } catch { /* a frame that will not decode is normal */ }
          } else {
            const c = canvas.current;
            const ctx = c?.getContext("2d", { willReadFrequently: true });
            if (c && ctx) {
              /* Downscale to ~320px wide: jsQR is pure JS and cost scales with
                 pixels, and a QR filling a third of the frame decodes fine at
                 that size. Full resolution drops the loop to a few fps. */
              const scale = Math.min(1, 320 / v.videoWidth);
              c.width = Math.round(v.videoWidth * scale);
              c.height = Math.round(v.videoHeight * scale);
              ctx.drawImage(v, 0, 0, c.width, c.height);
              const img = ctx.getImageData(0, 0, c.width, c.height);
              const { default: jsQR } = await import("jsqr");
              found = jsQR(img.data, img.width, img.height, {
                inversionAttempts: "dontInvert",
              })?.data ?? null;
            }
          }

          if (found) { void submit(found); return; }
        }

        raf = requestAnimationFrame(() => void tick());
      };

      raf = requestAnimationFrame(() => void tick());
    }

    void start();
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [attempt]);

  if (result) return <Outcome result={result} />;

  return (
    <Screen tabBar>
      <h1 className="text-[1.579em]">Check in</h1>

      <div
        className="relative mx-auto mt-8 grid aspect-square w-full max-w-[18.421em] place-items-center overflow-hidden rounded-lg"
        style={{ background: "var(--color-app-surface-2)" }}
      >
        <video
          ref={video}
          playsInline
          muted
          className="h-full w-full object-cover"
          style={{ display: cameraOn ? "block" : "none" }}
        />
        <canvas ref={canvas} className="hidden" aria-hidden />
        {!cameraOn && (
          <div className="flex max-w-[14.474em] flex-col items-center gap-3 px-4 text-center">
            <span className="text-[0.757em] leading-snug"
                  style={{ color: "var(--app-ink-45)" }}>
              {cameraReason ?? "Starting camera…"}
            </span>
            {/* Only once something has actually gone wrong — a retry button
                sitting there during the normal one-second startup would read
                as "this is expected to fail". */}
            {cameraReason && (
              <button
                type="button"
                onClick={() => { setCameraReason(null); setAttempt((n) => n + 1); }}
                className="rounded-pill px-4 py-2 text-[0.757em] font-bold"
                style={{
                  background: "var(--color-app-accent)",
                  color: "var(--color-app-accent-ink)",
                }}
              >
                Try again
              </button>
            )}
          </div>
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

      <p className="mt-7 text-center text-[0.921em]" style={{ color: "rgb(249 244 237 / 0.65)" }}>
        {busy
          ? "Checking you in…"
          : cameraOn
            ? "Point at the code on the reception counter"
            : "Use the code entry below"}
      </p>

      {error && (
        <p
          role="alert"
          className="mt-4 rounded-md px-4 py-3 text-center text-[0.822em]"
          style={{ background: "rgb(246 160 107 / 0.12)", color: "var(--color-app-accent)" }}
        >
          {error}
        </p>
      )}

      <div className="mt-auto pt-8">
        <p className="mb-2 text-[0.757em]" style={{ color: "var(--app-ink-50)" }}>
          Camera not working? Type the code shown under the QR.
        </p>
        <div className="flex gap-2">
          <input
            value={manual}
            onChange={(e) => setManual(e.target.value.trim())}
            placeholder="fw1.…"
            aria-label="Check-in code"
            className="min-w-0 flex-1 rounded-pill px-4 py-3 text-[0.921em] outline-none"
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
      <Screen center tabBar>
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

        <h1 className="mt-7 text-[1.974em]">{c.title}</h1>
        <p className="mt-2 max-w-[19.079em] text-[0.888em]" style={{ color: "var(--app-ink-60)" }}>
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
            className="mt-8 w-full rounded-pill bg-app-accent py-4 text-center text-[1.053em] font-bold text-app-accent-ink"
          >
            See my membership
          </Link>
        )}

        <Link
          href="/m"
          className="mt-4 text-[0.822em] font-semibold text-app-accent"
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
        className="text-[2.5em] leading-none font-bold tracking-[-0.02em]"
        style={{ color: accent ? "#fff" : undefined }}
      >
        {value}
      </div>
      <div
        className="mt-1 text-[0.757em]"
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
