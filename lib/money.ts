/* ============================================================================
   Money.

   Everything is paise (integer). Rupees as a float is how ₹8,500.00 becomes
   ₹8,499.99 on an invoice, and an invoice that does not foot is a GST problem
   for the gym, not a rounding curiosity.
   ========================================================================= */

const inr = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });
const inrPaise = new Intl.NumberFormat("en-IN", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** ₹8,500 — whole rupees, Indian digit grouping. For UI. */
export function formatINR(paise: number | string): string {
  return "₹" + inr.format(Math.round(Number(paise) / 100));
}

/** ₹8,500.00 — exact. For invoices, where the paise must be visible. */
export function formatINRExact(paise: number | string): string {
  return "₹" + inrPaise.format(Number(paise) / 100);
}

/** ₹2.84L / ₹1.2Cr — for dashboard tiles, where a 7-digit number wrecks the
 *  layout. Indian readers parse lakh/crore far faster than 2,840,000. */
export function formatINRCompact(paise: number | string): string {
  const rupees = Number(paise) / 100;
  if (rupees >= 1_00_00_000) return `₹${(rupees / 1_00_00_000).toFixed(2)}Cr`;
  if (rupees >= 1_00_000) return `₹${(rupees / 1_00_000).toFixed(2)}L`;
  return formatINR(paise);
}

export const rupeesToPaise = (rupees: number): number => Math.round(rupees * 100);
export const paiseToRupees = (paise: number | string): number => Number(paise) / 100;

/* ── GST ──────────────────────────────────────────────────────────────────── */

/** Gym memberships are SAC 999723, taxed at 18%. */
export const GST_RATE = 0.18;
export const SAC_FITNESS = "999723";

export interface GstSplit {
  taxablePaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  totalPaise: number;
}

/**
 * Splits tax the way the invoice must show it.
 *
 * Intra-state supply is CGST + SGST at half the rate each; inter-state is a
 * single IGST line. The halves are computed by splitting the total tax rather
 * than rounding each half independently, so CGST + SGST always equals the tax
 * charged — off-by-one paise between the two is a real audit query.
 *
 * Mirrors issue_invoice() in migration 0005; the `matches the database` test
 * pins them together.
 */
export function gstSplit(
  taxablePaise: number,
  { rate = GST_RATE, interState = false } = {},
): GstSplit {
  const tax = Math.round(taxablePaise * rate);
  const half = Math.floor(tax / 2);

  return {
    taxablePaise,
    cgstPaise: interState ? 0 : half,
    sgstPaise: interState ? 0 : tax - half,
    igstPaise: interState ? tax : 0,
    totalPaise: taxablePaise + tax,
  };
}

/* ── dates ────────────────────────────────────────────────────────────────── */

/** Indian financial year: 1 April to 31 March. '2026-27'. */
export function fiscalYearOf(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const year = d.getUTCFullYear();
  const startYear = d.getUTCMonth() >= 3 ? year : year - 1;
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, "0")}`;
}

/** 12 Jun 2026 — the format used throughout the design. */
export function formatDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("en-IN", {
    day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata",
  }).replace(/ /g, " ");
}

export function daysUntil(date: Date | string, from: Date = new Date()): number {
  const d = typeof date === "string" ? new Date(date) : date;
  return Math.ceil((d.getTime() - from.getTime()) / 86_400_000);
}
