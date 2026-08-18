import "server-only";

import { canonicalCode } from "./code-format";

export { canonicalCode, formatCode } from "./code-format";

/* ============================================================================
   How a member's phone number becomes a login.

   Supabase needs an email or a phone to identify an account. Phone logins are
   disabled on this project — enabling them requires configuring an SMS
   provider, which is exactly the dependency this whole design avoids — so the
   phone is mapped to a synthetic address the member never sees or types.

   .invalid is reserved by RFC 2606 and can never resolve, so no mail is ever
   attempted against it. The member types their phone number; this is what the
   auth layer receives.

   Deliberately NOT scoped per gym. One person, one login: keying it on the
   gym slug would mean a member who moves gyms silently loses their account,
   and slugs are meant to be stable but are not immutable.
   ========================================================================= */

const MEMBER_DOMAIN = "members.fitwell.invalid";

/** 10 digits starting 6-9, with or without +91 — the Indian mobile range. */
export function normalisePhone(input: string): string | null {
  const digits = input.replace(/\D/g, "").replace(/^91/, "");
  return /^[6-9]\d{9}$/.test(digits) ? `+91${digits}` : null;
}

/** `+919845021765` -> `919845021765@members.fitwell.invalid` */
export function authEmailForPhone(e164: string): string {
  return `${e164.replace(/\D/g, "")}@${MEMBER_DOMAIN}`;
}

/* ── codes ────────────────────────────────────────────────────────────────── */

/* No I, O, 0 or 1: these get read aloud across a counter and written down,
   and those four are where the mistakes are. */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function randomCode(length: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return [...bytes].map((b) => ALPHABET[b % ALPHABET.length]).join("");
}

/** Six characters, shown as K7M-4Q2. Short enough to type, ~10^9 combinations. */
export function newClaimCode(): string {
  return randomCode(6);
}

/** Eight, shown as R4T9-KM2P. Longer because it is written down and kept. */
export function newRecoveryCode(): string {
  return randomCode(8);
}


/**
 * Digest for storage. SHA-256 rather than a password hash on purpose: these
 * are high-entropy random codes with a short life, not human-chosen secrets,
 * so there is nothing for a slow hash to protect against — and the /join
 * lookup has to find a row by digest, which needs it to be deterministic.
 */
export async function hashCode(code: string): Promise<string> {
  const data = new TextEncoder().encode(canonicalCode(code));
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

