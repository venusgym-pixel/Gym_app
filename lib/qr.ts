/* ============================================================================
   Kiosk QR tokens.

   Two kinds of code, and the difference is the whole security model.

   A SCREEN code rotates every 30 seconds. It proves the scanner was looking at
   a live kiosk display, because a photograph of it is worthless ninety seconds
   later.

   A POSTER code is printed and stuck on a wall, so it is static by definition
   and can be photographed once and used from the car park until someone
   reprints it. That is a real cost and it is the gym's to choose: a small gym
   whose members walk past reception anyway may reasonably prefer a sheet of
   paper to a tablet that has to stay powered on. What it does NOT weaken is
   who may check in — identity comes from the member's session, and whether
   their membership allows entry is decided by record_checkin on the server.

   Because the two are not equally trustworthy, a scan records WHICH it was, so
   attendance reporting can tell proof-of-presence from self-reported presence
   rather than averaging the two into a number nobody can interpret.

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

/** What a lookup must return for a device. The nonce is only consulted for
 *  poster codes, and is what reprinting invalidates. */
export interface KioskSecrets {
  secret: string;
  posterNonce?: string | null;
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

export type QrMode = "screen" | "poster";

export type QrVerdict =
  | { ok: true; gymId: string; kioskId: string; mode: QrMode }
  | { ok: false; reason: "malformed" | "expired" | "bad-signature" | "wrong-gym" | "reprinted" };

/**
 * The payload a printed poster carries.
 * Format: `fwp1.<gymId>.<kioskId>.<nonce>.<digest>`
 *
 * The nonce is the printed sheet's identity. Rotating it is what "print a new
 * one" means: every copy of the old sheet stops working the moment it changes,
 * including the photograph in someone's camera roll.
 *
 * `poster` is baked into the signed message as a domain separator. Without it
 * the two formats sign the same shape of string, and a digest lifted from one
 * could be replayed as the other.
 */
export async function makePosterToken(
  secret: string,
  gymId: string,
  kioskId: string,
  nonce: string,
): Promise<string> {
  const digest = await hmac(secret, `${gymId}.${kioskId}.poster.${nonce}`);
  return `fwp1.${gymId}.${kioskId}.${nonce}.${digest}`;
}

/**
 * Verifies a scanned token.
 *
 * `expectedGymId` is checked because a token is only meaningful for the gym
 * that issued it — without it, a member of gym A could check in against gym
 * B's kiosk and land a row in B's attendance table.
 */
export async function verifyKioskToken(
  token: string,
  lookup: (gymId: string, kioskId: string) => Promise<KioskSecrets | string | null>,
  { now = Date.now(), expectedGymId }: { now?: number; expectedGymId?: string } = {},
): Promise<QrVerdict> {
  const parts = token.split(".");
  if (parts.length !== 5) return { ok: false, reason: "malformed" };

  const mode: QrMode | null =
    parts[0] === "fw1" ? "screen" : parts[0] === "fwp1" ? "poster" : null;
  if (!mode) return { ok: false, reason: "malformed" };

  const [, gymId, kioskId, variable, digest] = parts;

  if (expectedGymId && gymId !== expectedGymId) return { ok: false, reason: "wrong-gym" };

  /* A screen code is only good for its own 30-second window. Check that before
     the database lookup: an expired code is the common case at a kiosk someone
     scanned slowly, and it needs no query to reject. */
  if (mode === "screen") {
    const w = Number(variable);
    if (!Number.isInteger(w)) return { ok: false, reason: "malformed" };
    if (Math.abs(windowAt(now) - w) > QR_SKEW_WINDOWS) return { ok: false, reason: "expired" };
  }

  const found = await lookup(gymId, kioskId);
  if (!found) return { ok: false, reason: "bad-signature" };
  const { secret, posterNonce } = typeof found === "string" ? { secret: found, posterNonce: null } : found;

  /* A poster whose nonce no longer matches has been reprinted. Distinguished
     from a bad signature because it is not an attack — it is the old sheet
     still on the wall, or a photo of it, and the member deserves to be told to
     scan the new one. */
  if (mode === "poster" && (!posterNonce || posterNonce !== variable)) {
    return { ok: false, reason: "reprinted" };
  }

  const message =
    mode === "poster"
      ? `${gymId}.${kioskId}.poster.${variable}`
      : `${gymId}.${kioskId}.${variable}`;

  const expected = await hmac(secret, message);
  if (!timingSafeEqual(expected, digest)) return { ok: false, reason: "bad-signature" };

  return { ok: true, gymId, kioskId, mode };
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
