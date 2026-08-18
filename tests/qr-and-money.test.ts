/* ============================================================================
   QR tokens and money — the two places where a small mistake is expensive.

   Money because a rounding error lands on a GST invoice; QR because a weak
   token turns attendance into fiction, and attendance is what the whole
   retention engine reads.

   The GST assertions are deliberately duplicated against the database in
   tests/lifecycle.test.ts. TypeScript computes the checkout preview, Postgres
   computes the invoice, and the member must never see one number and be
   charged another.
   ========================================================================= */

import jsQR from "jsqr";
import { encodeQr } from "../lib/qr-encode";
import { describe, expect, it } from "vitest";
import {
  fiscalYearOf, formatINR, formatINRCompact, formatINRExact, gstSplit,
  rupeesToPaise,
} from "../lib/money";
import {
  makeKioskToken, offlineCheckinIsFresh, QR_WINDOW_SECONDS, verifyKioskToken,
} from "../lib/qr";

const GYM = "11111111-1111-4111-8111-111111111111";
const KIOSK = "22222222-2222-4222-8222-222222222222";
const SECRET = "kiosk-secret-do-not-ship";
const secretFor = async () => SECRET;

describe("money", () => {
  it("groups rupees the Indian way", () => {
    expect(formatINR(850_000)).toBe("₹8,500");
    expect(formatINR(2_800_000)).toBe("₹28,000");
    expect(formatINR(3_304_000)).toBe("₹33,040");
    expect(formatINR(2_84_00_000)).toBe("₹2,84,000");   // lakh grouping, not 284,000
  });

  it("shows exact paise on invoices", () => {
    expect(formatINRExact(850_000)).toBe("₹8,500.00");
    expect(formatINRExact(1_003_050)).toBe("₹10,030.50");
  });

  it("compacts big numbers for dashboard tiles", () => {
    expect(formatINRCompact(2_84_00_000)).toBe("₹2.84L");     // ₹2,84,000
    expect(formatINRCompact(1_50_00_00_000)).toBe("₹1.50Cr"); // ₹1,50,00,000
    expect(formatINRCompact(850_000)).toBe("₹8,500");         // small stays exact
  });

  it("splits GST so the halves always sum to the tax charged", () => {
    // The three plan prices from the design board.
    for (const rupees of [3_200, 8_500, 28_000]) {
      const s = gstSplit(rupeesToPaise(rupees));
      expect(s.cgstPaise + s.sgstPaise).toBe(s.totalPaise - s.taxablePaise);
      expect(s.igstPaise).toBe(0);
    }
  });

  it("matches the totals the design shows at checkout", () => {
    expect(gstSplit(320_000).totalPaise).toBe(377_600);      // ₹3,776
    expect(gstSplit(850_000).totalPaise).toBe(1_003_000);    // ₹10,030
    expect(gstSplit(2_800_000).totalPaise).toBe(3_304_000);  // ₹33,040
  });

  it("never loses a paisa to rounding on an odd tax amount", () => {
    // ₹333.33 at 18% = ₹59.9994 → 5999.94 paise → rounds to 6000.
    const s = gstSplit(33_333);
    expect(s.cgstPaise + s.sgstPaise).toBe(6_000);
    expect(s.cgstPaise).toBe(3_000);
    expect(s.sgstPaise).toBe(3_000);
    expect(s.totalPaise).toBe(39_333);
  });

  it("uses a single IGST line for inter-state supply", () => {
    const s = gstSplit(850_000, { interState: true });
    expect(s.igstPaise).toBe(153_000);
    expect(s.cgstPaise).toBe(0);
    expect(s.sgstPaise).toBe(0);
    expect(s.totalPaise).toBe(1_003_000);   // same total, different lines
  });

  it("puts the financial year boundary at 1 April", () => {
    expect(fiscalYearOf("2026-08-12")).toBe("2026-27");
    expect(fiscalYearOf("2026-03-31")).toBe("2025-26");
    expect(fiscalYearOf("2026-04-01")).toBe("2026-27");
    expect(fiscalYearOf("2027-01-15")).toBe("2026-27");
  });
});

describe("kiosk QR tokens", () => {
  const now = 1_800_000_000_000;

  it("round-trips a fresh token", async () => {
    const token = await makeKioskToken(SECRET, GYM, KIOSK, now);
    const v = await verifyKioskToken(token, secretFor, { now, expectedGymId: GYM });
    expect(v).toEqual({ ok: true, gymId: GYM, kioskId: KIOSK });
  });

  it("rotates: the same kiosk emits a different token each window", async () => {
    const a = await makeKioskToken(SECRET, GYM, KIOSK, now);
    const b = await makeKioskToken(SECRET, GYM, KIOSK, now + QR_WINDOW_SECONDS * 1000);
    expect(a).not.toBe(b);
  });

  it("tolerates one window of skew, and no more", async () => {
    const token = await makeKioskToken(SECRET, GYM, KIOSK, now);
    const w = QR_WINDOW_SECONDS * 1000;

    for (const t of [now + w, now - w]) {
      expect((await verifyKioskToken(token, secretFor, { now: t })).ok).toBe(true);
    }
    // Two windows out — a photographed code is already useless.
    const stale = await verifyKioskToken(token, secretFor, { now: now + 2 * w + 1 });
    expect(stale).toEqual({ ok: false, reason: "expired" });
  });

  it("rejects a token minted with the wrong secret", async () => {
    const forged = await makeKioskToken("not-the-secret", GYM, KIOSK, now);
    const v = await verifyKioskToken(forged, secretFor, { now });
    expect(v).toEqual({ ok: false, reason: "bad-signature" });
  });

  it("rejects a token whose digest has been tampered with", async () => {
    const token = await makeKioskToken(SECRET, GYM, KIOSK, now);
    const tampered = token.slice(0, -1) + (token.at(-1) === "a" ? "b" : "a");
    expect((await verifyKioskToken(tampered, secretFor, { now })).ok).toBe(false);
  });

  it("refuses a valid token presented to the wrong gym", async () => {
    const token = await makeKioskToken(SECRET, GYM, KIOSK, now);
    const other = "33333333-3333-4333-8333-333333333333";
    const v = await verifyKioskToken(token, secretFor, { now, expectedGymId: other });
    expect(v).toEqual({ ok: false, reason: "wrong-gym" });
  });

  it("rejects junk without throwing", async () => {
    for (const junk of ["", "nope", "fw1.a.b", "fw2.a.b.1.c", "fw1.a.b.NaN.c"]) {
      const v = await verifyKioskToken(junk, secretFor, { now });
      expect(v.ok).toBe(false);
    }
  });

  it("rejects a token that never came from a kiosk we know", async () => {
    const token = await makeKioskToken(SECRET, GYM, KIOSK, now);
    const v = await verifyKioskToken(token, async () => null, { now });
    expect(v).toEqual({ ok: false, reason: "bad-signature" });
  });
});

describe("offline check-in freshness", () => {
  const now = 1_800_000_000_000;

  it("accepts a scan queued minutes ago in a basement doorway", () => {
    expect(offlineCheckinIsFresh(now - 5 * 60_000, now)).toBe(true);
    expect(offlineCheckinIsFresh(now - 5 * 3_600_000, now)).toBe(true);
  });

  it("rejects a scan replayed the next day", () => {
    expect(offlineCheckinIsFresh(now - 25 * 3_600_000, now)).toBe(false);
  });

  it("rejects a scan claiming to be from the future", () => {
    expect(offlineCheckinIsFresh(now + 60_000, now)).toBe(false);
  });
});

/* ============================================================================
   The QR codes must actually be readable.

   The hand-written encoder this replaced produced grids that no decoder could
   read — including for a five-character payload — and it shipped on the
   kiosk for weeks. Nothing caught it because an invalid QR looks exactly like
   a valid one, and every test asserted on the matrix rather than on whether a
   camera could decode it.

   So: encode, rasterise, and decode with jsQR — the same library the member
   app's scanner uses. If this passes, a phone can read it.
   ========================================================================= */

describe("QR codes decode", () => {
  /** Render a matrix to RGBA the way a camera would see it, then read it back. */
  function roundTrip(text: string): string | null {
    const qr = encodeQr(text);
    const size = qr.length;
    const quiet = 4;
    const scale = 5;
    const dim = (size + quiet * 2) * scale;

    const data = new Uint8ClampedArray(dim * dim * 4).fill(255);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (!qr[y][x]) continue;
        for (let dy = 0; dy < scale; dy++) {
          for (let dx = 0; dx < scale; dx++) {
            const px = (((y + quiet) * scale + dy) * dim + (x + quiet) * scale + dx) * 4;
            data[px] = data[px + 1] = data[px + 2] = 0;
          }
        }
      }
    }

    return jsQR(data, dim, dim)?.data ?? null;
  }

  it("reads back a member claim URL", () => {
    const url = "https://fitwell.venusgym280.workers.dev/join/8Y6P5H";
    expect(roundTrip(url)).toBe(url);
  });

  it("reads back a kiosk check-in token", () => {
    /* Roughly the shape of a rotating QR token: prefix, payload, signature. */
    const token = `fw1.${"a".repeat(40)}.${"b".repeat(32)}`;
    expect(roundTrip(token)).toBe(token);
  });

  it("reads back something tiny", () => {
    // The old encoder failed even on this, which is what gave it away.
    expect(roundTrip("HELLO")).toBe("HELLO");
  });
});
