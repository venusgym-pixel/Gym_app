"use client";

import { encodeQr } from "@/lib/qr-encode";

import { useEffect, useRef, useState } from "react";

/* ============================================================================
   K-01 · The QR the members scan.

   Fetched from /api/qr, which HMACs (gym, kiosk, 30-second window) with a
   secret that never leaves the server. It rotates because anything static —
   a printed poster, a fixed gym id — can be photographed once and reused
   from the car park, which turns attendance data into fiction and quietly
   breaks every retention number that reads it.

   The QR is drawn here rather than fetched as an image so the screen keeps
   working when the gym's internet drops mid-session: only the token refresh
   needs the network, and a stale token fails closed at the door.
   ========================================================================= */

interface TokenResponse {
  token: string;
  kioskId: string;
  refreshInSeconds: number;
}

export function KioskDisplay({ gymName }: { gymName: string }) {
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(30);
  const canvas = useRef<HTMLCanvasElement>(null);

  /* Two independent timers rather than one.
     Triggering the refresh from inside a setState updater would put a side
     effect in a function React requires to be pure — and React may call an
     updater more than once, which would mean two token fetches per window.

     The `alive` guard matters on a kiosk: this page can sit for weeks, and a
     fetch in flight when someone navigates away must not write state into an
     unmounted tree. */
  useEffect(() => {
    let alive = true;

    async function load() {
      try {
        const res = await fetch("/api/qr", { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as TokenResponse;
        if (!alive) return;
        setToken(data.token);
        setSecondsLeft(data.refreshInSeconds);
        setError(null);
      } catch {
        // Keep showing the last good code: it stays valid for one more window,
        // and a blank screen at the door is worse than a nearly-expired one.
        if (alive) setError("Reconnecting…");
      }
    }

    const first = setTimeout(load, 0);
    const poll = setInterval(load, 30_000);
    const countdown = setInterval(
      () => setSecondsLeft((s) => (s <= 1 ? 30 : s - 1)),
      1000,
    );

    return () => {
      alive = false;
      clearTimeout(first);
      clearInterval(poll);
      clearInterval(countdown);
    };
  }, []);

  useEffect(() => {
    if (token && canvas.current) drawQr(canvas.current, token);
  }, [token]);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-8 bg-neutral-900 p-8 text-neutral-100">
      <div className="text-center">
        <p className="font-mono text-[12px] tracking-[0.14em] text-neutral-400 uppercase">
          {gymName}
        </p>
        <h1 className="mt-2 text-[38px] leading-tight text-neutral-100">
          Scan to check in
        </h1>
      </div>

      <div className="rounded-lg bg-white p-6">
        <canvas
          ref={canvas}
          width={320}
          height={320}
          className="block h-[320px] w-[320px]"
          aria-label="Check-in QR code"
        />
      </div>

      <div className="flex items-center gap-3 text-[13px] text-neutral-400">
        <span
          className="h-2 w-2 rounded-pill bg-sage-400"
          style={{ opacity: secondsLeft % 2 ? 1 : 0.3 }}
          aria-hidden
        />
        <span className="tabular">
          {error ?? `Refreshes in ${secondsLeft}s`}
        </span>
      </div>

      <p className="max-w-sm text-center text-[12.5px] text-neutral-500">
        Open the Fitwell app and tap the QR button. The code changes every 30
        seconds, so a photo of it will not work.
      </p>
    </div>
  );
}

/* ── a minimal QR encoder ─────────────────────────────────────────────────── */

/**
 * Byte-mode QR, version chosen to fit, error correction level L.
 *
 * Written out rather than pulled from npm: the payload is a fixed ~90-char
 * ASCII token, which is the narrowest possible use of QR, and this screen is
 * the one thing in the product that must keep working when everything else
 * is down. A dependency here buys nothing and adds a supply-chain surface to
 * the device sitting unattended on the reception counter.
 */
function drawQr(el: HTMLCanvasElement, text: string) {
  const qr = encodeQr(text);
  const ctx = el.getContext("2d");
  if (!ctx) return;

  const size = qr.length;
  const quiet = 2;
  const scale = Math.floor(el.width / (size + quiet * 2));
  const offset = Math.floor((el.width - scale * size) / 2);

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, el.width, el.height);
  ctx.fillStyle = "#000000";
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (qr[y][x]) ctx.fillRect(offset + x * scale, offset + y * scale, scale, scale);
    }
  }
}
