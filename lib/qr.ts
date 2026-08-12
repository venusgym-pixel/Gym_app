/* ============================================================================
   Kiosk QR tokens.

   The kiosk shows a code that rotates every 30 seconds. Anything static — a
   printed poster, a fixed gym id — can be photographed once and used from the
   car park forever, which turns attendance data into fiction and defeats the
   whole retention engine that reads it.

   The token is an HMAC over (gym, branch, time-window). It proves the scanner
   was looking at a live kiosk screen recently. It is NOT proof of identity:
   who is checking in comes from the member's authenticated session.

   Web Crypto, so this runs unchanged in the Edge runtime and in Node.
   ========================================================================= */

export const QR_WINDOW_SECONDS = 30;

/** How many windows either side to accept. One window each way tolerates a
 *  slow scan and modest clock skew between kiosk and server. */
export const QR_SKEW_WINDOWS = 1;

const encoder = new TextEncoder();

function windowAt(epochMs: number): number {
  return Math.floor(epochMs / 1000 / QR_WINDOW_SECONDS);
}

async function hmac(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 32); // 128 bits — plenty, and keeps the QR small enough to scan fast
}

export interface KioskTokenParts {
  gymId: string;
  kioskId: string;
  window: number;
  digest: string;
}

/**
 * The payload the kiosk renders as a QR code.
 * Format: `fw1.<gymId>.<kioskId>.<window>.<digest>`
 */
export async function makeKioskToken(
  secret: string,
  gymId: string,
  kioskId: string,
  now: number = Date.now(),
): Promise<string> {
  const w = windowAt(now);
  const digest = await hmac(secret, `${gymId}.${kioskId}.${w}`);
  return `fw1.${gymId}.${kioskId}.${w}.${digest}`;
}

export type QrVerdict =
  | { ok: true; gymId: string; kioskId: string }
  | { ok: false; reason: "malformed" | "expired" | "bad-signature" | "wrong-gym" };

/**
 * Verifies a scanned token.
 *
 * `expectedGymId` is checked because a token is only meaningful for the gym
 * that issued it — without it, a member of gym A could check in against gym
 * B's kiosk and land a row in B's attendance table.
 */
export async function verifyKioskToken(
  token: string,
  lookupSecret: (gymId: string, kioskId: string) => Promise<string | null>,
  { now = Date.now(), expectedGymId }: { now?: number; expectedGymId?: string } = {},
): Promise<QrVerdict> {
  const parts = token.split(".");
  if (parts.length !== 5 || parts[0] !== "fw1") return { ok: false, reason: "malformed" };

  const [, gymId, kioskId, windowStr, digest] = parts;
  const w = Number(windowStr);
  if (!Number.isInteger(w)) return { ok: false, reason: "malformed" };

  if (expectedGymId && gymId !== expectedGymId) return { ok: false, reason: "wrong-gym" };

  const current = windowAt(now);
  if (Math.abs(current - w) > QR_SKEW_WINDOWS) return { ok: false, reason: "expired" };

  const secret = await lookupSecret(gymId, kioskId);
  if (!secret) return { ok: false, reason: "bad-signature" };

  const expected = await hmac(secret, `${gymId}.${kioskId}.${w}`);
  if (!timingSafeEqual(expected, digest)) return { ok: false, reason: "bad-signature" };

  return { ok: true, gymId, kioskId };
}

/** Constant-time compare. A fast `===` leaks, through timing, how much of a
 *  forged digest was correct — enough to forge one byte at a time. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/* ── offline queue ────────────────────────────────────────────────────────── */

/**
 * Members check in where signal is worst — a basement gym doorway. The app
 * queues the scan and syncs later, so the server must accept a check-in that
 * happened minutes ago while still refusing a token replayed tomorrow.
 */
export const OFFLINE_MAX_AGE_MS = 6 * 60 * 60 * 1000; // 6 hours

export function offlineCheckinIsFresh(
  scannedAt: number,
  now: number = Date.now(),
): boolean {
  const age = now - scannedAt;
  return age >= 0 && age <= OFFLINE_MAX_AGE_MS;
}
