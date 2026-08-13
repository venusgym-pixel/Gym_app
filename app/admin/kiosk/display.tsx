"use client";

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
  const qr = encode(text);
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

/* Galois field tables for Reed-Solomon. */
const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
})();

const mul = (a: number, b: number) => (a && b ? EXP[LOG[a] + LOG[b]] : 0);

function rsGenerator(degree: number): number[] {
  let poly = [1];
  for (let i = 0; i < degree; i++) {
    const next = new Array(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= poly[j];
      next[j + 1] ^= mul(poly[j], EXP[i]);
    }
    poly = next;
  }
  return poly;
}

function rsEncode(data: number[], ecLen: number): number[] {
  const gen = rsGenerator(ecLen);
  const res = new Array(ecLen).fill(0);
  for (const byte of data) {
    const factor = byte ^ res[0];
    res.shift();
    res.push(0);
    for (let i = 0; i < ecLen; i++) res[i] ^= mul(gen[i + 1], factor);
  }
  return res;
}

/* Version capacities (byte mode, EC level L) and their EC codewords. */
const VERSIONS = [
  { v: 5, size: 37, data: 108, ec: 26, blocks: 1 },
  { v: 6, size: 41, data: 136, ec: 18, blocks: 2 },
  { v: 7, size: 45, data: 156, ec: 20, blocks: 2 },
  { v: 8, size: 49, data: 194, ec: 24, blocks: 2 },
];

const ALIGN: Record<number, number[]> = {
  5: [6, 30], 6: [6, 34], 7: [6, 22, 38], 8: [6, 24, 42],
};

function encode(text: string): boolean[][] {
  const bytes = new TextEncoder().encode(text);
  const spec = VERSIONS.find((s) => bytes.length + 3 <= s.data);
  if (!spec) throw new Error("payload too long for this encoder");

  /* ── bitstream: mode + length + data + terminator + padding ── */
  const bits: number[] = [];
  const push = (val: number, len: number) => {
    for (let i = len - 1; i >= 0; i--) bits.push((val >> i) & 1);
  };

  push(0b0100, 4);          // byte mode
  push(bytes.length, 8);    // versions 1-9 use an 8-bit length
  for (const b of bytes) push(b, 8);

  const capacityBits = spec.data * 8;
  push(0, Math.min(4, capacityBits - bits.length));
  while (bits.length % 8) bits.push(0);

  const codewords: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    codewords.push(parseInt(bits.slice(i, i + 8).join(""), 2));
  }
  const PAD = [0xec, 0x11];
  for (let i = 0; codewords.length < spec.data; i++) codewords.push(PAD[i % 2]);

  /* ── error correction, interleaved across blocks ── */
  const perBlock = Math.floor(spec.data / spec.blocks);
  const dataBlocks: number[][] = [];
  const ecBlocks: number[][] = [];
  for (let b = 0; b < spec.blocks; b++) {
    const chunk = codewords.slice(b * perBlock, (b + 1) * perBlock);
    dataBlocks.push(chunk);
    ecBlocks.push(rsEncode(chunk, spec.ec));
  }

  const final: number[] = [];
  for (let i = 0; i < perBlock; i++)
    for (const blk of dataBlocks) if (i < blk.length) final.push(blk[i]);
  for (let i = 0; i < spec.ec; i++) for (const blk of ecBlocks) final.push(blk[i]);

  /* ── matrix ── */
  const n = spec.size;
  const m: (boolean | null)[][] = Array.from({ length: n }, () => new Array(n).fill(null));

  const finder = (r: number, c: number) => {
    for (let y = -1; y <= 7; y++)
      for (let x = -1; x <= 7; x++) {
        const yy = r + y, xx = c + x;
        if (yy < 0 || yy >= n || xx < 0 || xx >= n) continue;
        const on =
          (y >= 0 && y <= 6 && (x === 0 || x === 6)) ||
          (x >= 0 && x <= 6 && (y === 0 || y === 6)) ||
          (y >= 2 && y <= 4 && x >= 2 && x <= 4);
        m[yy][xx] = on;
      }
  };
  finder(0, 0); finder(0, n - 7); finder(n - 7, 0);

  for (const c of ALIGN[spec.v] ?? [])
    for (const r of ALIGN[spec.v] ?? []) {
      if ((r <= 8 && c <= 8) || (r <= 8 && c >= n - 9) || (r >= n - 9 && c <= 8)) continue;
      for (let y = -2; y <= 2; y++)
        for (let x = -2; x <= 2; x++)
          m[r + y][c + x] = Math.max(Math.abs(y), Math.abs(x)) !== 1;
    }

  for (let i = 8; i < n - 8; i++) {
    if (m[6][i] === null) m[6][i] = i % 2 === 0;
    if (m[i][6] === null) m[i][6] = i % 2 === 0;
  }
  m[n - 8][8] = true; // dark module

  // Reserve format areas.
  for (let i = 0; i < 9; i++) {
    if (m[8][i] === null) m[8][i] = false;
    if (m[i][8] === null) m[i][8] = false;
  }
  for (let i = n - 8; i < n; i++) {
    if (m[8][i] === null) m[8][i] = false;
    if (m[i][8] === null) m[i][8] = false;
  }

  /* ── place data, mask 0, boustrophedon from bottom-right ── */
  let bitIndex = 0;
  const stream: number[] = [];
  for (const cw of final) for (let i = 7; i >= 0; i--) stream.push((cw >> i) & 1);

  let upward = true;
  for (let col = n - 1; col > 0; col -= 2) {
    if (col === 6) col--; // skip the vertical timing line
    for (let i = 0; i < n; i++) {
      const row = upward ? n - 1 - i : i;
      for (const c of [col, col - 1]) {
        if (m[row][c] !== null) continue;
        const bit = bitIndex < stream.length ? stream[bitIndex++] : 0;
        m[row][c] = ((row + c) % 2 === 0 ? bit ^ 1 : bit) === 1;
      }
    }
    upward = !upward;
  }

  /* ── format info: EC level L, mask 0 ── */
  const FORMAT = 0b111011111000100;
  for (let i = 0; i <= 5; i++) m[8][i] = ((FORMAT >> i) & 1) === 1;
  m[8][7] = ((FORMAT >> 6) & 1) === 1;
  m[8][8] = ((FORMAT >> 7) & 1) === 1;
  m[7][8] = ((FORMAT >> 8) & 1) === 1;
  for (let i = 9; i < 15; i++) m[14 - i][8] = ((FORMAT >> i) & 1) === 1;
  for (let i = 0; i < 8; i++) m[n - 1 - i][8] = ((FORMAT >> i) & 1) === 1;
  for (let i = 8; i < 15; i++) m[8][n - 15 + i] = ((FORMAT >> i) & 1) === 1;

  return m.map((row) => row.map((cell) => cell === true));
}
