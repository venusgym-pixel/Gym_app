/* ============================================================================
   UPI intent links.

   A malformed link opens a payment app with the wrong payee or no amount, and
   the member believes they have paid. So the edges are the point.
   ========================================================================= */

import { describe, expect, it } from "vitest";
import { buildUpiLink, isVpa } from "../lib/upi";

const base = { vpa: "venusgym@okhdfcbank", payeeName: "Fitwell Koramangala" };

describe("recognising a VPA", () => {
  it("accepts the handles Indian banks actually issue", () => {
    for (const v of ["venusgym@okhdfcbank", "gym.name@ybl", "9876543210@paytm",
                     "a_b-c@upi", "venus+gym@okaxis"]) {
      expect(isVpa(v)).toBe(true);
    }
  });

  it("rejects what is plainly not one", () => {
    for (const v of ["", "venusgym", "@okhdfcbank", "venusgym@", "a@b",
                     "has space@ybl"]) {
      expect(isVpa(v)).toBe(false);
    }
  });
});

describe("building the link", () => {
  it("carries payee, name, amount and currency", () => {
    const url = new URL(buildUpiLink({ ...base, amountPaise: 320000 })!);
    expect(url.protocol).toBe("upi:");
    const p = new URLSearchParams(url.search);
    expect(p.get("pa")).toBe("venusgym@okhdfcbank");
    expect(p.get("pn")).toBe("Fitwell Koramangala");
    expect(p.get("am")).toBe("3200.00");
    expect(p.get("cu")).toBe("INR");
  });

  it("always sends two decimals", () => {
    /* Apps have been seen to reject "3200" where they accept "3200.00". */
    expect(buildUpiLink({ ...base, amountPaise: 320050 })).toContain("am=3200.50");
    expect(buildUpiLink({ ...base, amountPaise: 100 })).toContain("am=1.00");
  });

  it("omits the amount when there is none, rather than sending zero", () => {
    /* am=0.00 makes an app refuse outright. No am at all means "type it",
       which is the correct behaviour for an open payment. */
    for (const amt of [null, undefined, 0, ""]) {
      const link = buildUpiLink({ ...base, amountPaise: amt as never })!;
      expect(link).not.toContain("am=");
      expect(link).toContain("pa=venusgym%40okhdfcbank");
    }
  });

  it("encodes spaces as %20, not +", () => {
    /* URLSearchParams gives "+", which several UPI apps render literally in
       the payee name. */
    const link = buildUpiLink({ ...base, amountPaise: 320000, note: "Annual membership" })!;
    expect(link).not.toContain("+");
    expect(link).toContain("%20");
  });

  it("returns null for an unusable VPA rather than a broken link", () => {
    /* A button that opens a payment app with no payee is worse than no
       button: the member thinks they have paid. */
    expect(buildUpiLink({ ...base, vpa: "not-a-vpa" })).toBeNull();
    expect(buildUpiLink({ ...base, vpa: "" })).toBeNull();
  });

  it("keeps the payee name short enough to survive", () => {
    const long = "A".repeat(200);
    const p = new URLSearchParams(new URL(buildUpiLink({ ...base, payeeName: long })!).search);
    expect(p.get("pn")!.length).toBeLessThanOrEqual(40);
  });

  it("falls back to a payee name rather than sending an empty one", () => {
    const p = new URLSearchParams(new URL(buildUpiLink({ ...base, payeeName: "   " })!).search);
    expect(p.get("pn")).toBe("Gym");
  });
});
