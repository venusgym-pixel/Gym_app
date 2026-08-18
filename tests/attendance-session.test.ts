/* ============================================================================
   The 90-minute session window.

   Pure functions, so no database here — but this is the rule the admin
   attendance screen renders "In the gym now" from, and the boundary is the
   whole of it: one minute either side of 90 must fall on opposite sides.
   ========================================================================= */

import { describe, expect, it } from "vitest";
import { SESSION_MINUTES, inProgress, sessionEndsAt } from "../lib/attendance";

const NOW = new Date("2026-08-18T18:00:00.000Z");
const minutesAgo = (n: number) => new Date(NOW.getTime() - n * 60_000);

describe("a visit expires 90 minutes after entry", () => {
  it("is the documented window", () => {
    expect(SESSION_MINUTES).toBe(90);
  });

  it("counts someone who arrived 20 minutes ago as in the gym", () => {
    expect(inProgress(minutesAgo(20), NOW)).toBe(true);
  });

  it("counts someone who arrived 95 minutes ago as gone", () => {
    expect(inProgress(minutesAgo(95), NOW)).toBe(false);
  });

  it("holds at the boundary in both directions", () => {
    expect(inProgress(minutesAgo(89), NOW)).toBe(true);
    expect(inProgress(minutesAgo(91), NOW)).toBe(false);
    /* Exactly 90 is over: the window is the time still remaining, and at the
       ninetieth minute there is none. */
    expect(inProgress(minutesAgo(90), NOW)).toBe(false);
  });

  it("ends 90 minutes after entry, to the minute", () => {
    const entry = new Date("2026-08-18T17:05:00.000Z");
    expect(sessionEndsAt(entry).toISOString()).toBe("2026-08-18T18:35:00.000Z");
  });

  it("accepts the ISO strings that come back from the database", () => {
    /* Rows arrive as strings through PostgREST, never as Date objects. */
    expect(inProgress("2026-08-18T17:40:00.000Z", NOW)).toBe(true);
    expect(sessionEndsAt("2026-08-18T17:40:00.000Z").toISOString())
      .toBe("2026-08-18T19:10:00.000Z");
  });
});
