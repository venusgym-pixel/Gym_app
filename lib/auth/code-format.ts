/* ============================================================================
   Code shaping, shared by the server and the browser.

   Separate from member-identity.ts because that module is server-only — it
   holds the hashing and the synthetic-address mapping — while the counter
   screen is a client component that only needs to draw a code with a dash in
   it. Importing the server module there fails the build.
   ========================================================================= */

/** Strip formatting so K7M-4Q2, k7m4q2 and "K7M 4Q2" all match. */
export function canonicalCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** K7M4Q2 -> K7M-4Q2, R4T9KM2P -> R4T9-KM2P. Display only. */
export function formatCode(code: string): string {
  const c = canonicalCode(code);
  return c.length === 8 ? `${c.slice(0, 4)}-${c.slice(4)}` : `${c.slice(0, 3)}-${c.slice(3)}`;
}

/* ── the member's synthetic login address ─────────────────────────────────── */

/**
 * Members have no email, and Supabase needs one. Their phone number maps to a
 * reserved address they never see or type.
 *
 * Duplicated from member-identity.ts on purpose: that module is server-only,
 * and the login form runs in the browser. Both must produce the same string,
 * so any change here has to be made there too — a single test asserts it.
 */
export function memberAuthEmail(e164: string): string {
  return `${e164.replace(/\D/g, "")}@members.fitwell.invalid`;
}
