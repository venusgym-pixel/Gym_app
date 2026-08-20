/* ============================================================================
   Ramp sets.

   Pure arithmetic, but it is arithmetic a member loads onto a bar, so the
   edges matter more than the happy path: a light lifter must not be told to
   put 17.5kg on a 20kg barbell, and nobody should see the same weight
   prescribed three times.
   ========================================================================= */

import { describe, expect, it } from "vitest";
import { rampSets } from "../lib/warmup";

describe("ramping up to the working weight", () => {
  it("builds up in increasing steps below the working set", () => {
    const s = rampSets(100, true);
    expect(s.map((x) => x.weight)).toEqual([40, 60, 80]);
    expect(s.every((x) => x.weight < 100)).toBe(true);
  });

  it("rounds to the nearest 2.5kg, the smallest plate pair", () => {
    for (const s of rampSets(67.5, true)) {
      expect(s.weight % 2.5).toBe(0);
    }
  });

  it("never prescribes less than an empty barbell", () => {
    /* 40% of 50kg is 20kg — the bar itself. Anything under it cannot be
       loaded, so the floor is the bar rather than a smaller number. */
    expect(rampSets(50, true).every((s) => s.weight >= 20)).toBe(true);
    expect(rampSets(30, true).every((s) => s.weight >= 20)).toBe(true);
  });

  it("uses a much lower floor for dumbbells, where 5kg is real", () => {
    const s = rampSets(30, false);
    expect(s[0].weight).toBeLessThan(20);
    expect(s.every((x) => x.weight >= 2.5)).toBe(true);
  });

  it("collapses rather than repeating a weight", () => {
    /* A light barbell top set rounds every step to the bar. Three identical
       lines read as a bug, so only strictly increasing ones survive. */
    const s = rampSets(25, true);
    const weights = s.map((x) => x.weight);
    expect(new Set(weights).size).toBe(weights.length);
  });

  it("prescribes nothing at all for bodyweight work", () => {
    expect(rampSets(0, false)).toEqual([]);
    expect(rampSets(NaN, false)).toEqual([]);
  });

  it("gets lighter in weight and higher in reps as it goes", () => {
    const s = rampSets(120, true);
    for (let i = 1; i < s.length; i++) {
      expect(s[i].weight).toBeGreaterThan(s[i - 1].weight);
      expect(s[i].reps).toBeLessThan(s[i - 1].reps);
    }
  });
});
