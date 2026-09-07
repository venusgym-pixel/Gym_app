/* ============================================================================
   SelectOrOther, as a contract rather than as a rendered component.

   The behaviours worth pinning are the two that break silently: a stored
   value nobody listed must reopen in Other mode with that value intact, and
   the sentinel must not collide with a real answer — "Other" is a legitimate
   thing to put in a gender field.
   ========================================================================= */

import { describe, expect, it } from "vitest";

/* Mirrors the component: which mode it opens in, given a stored value. */
function openMode(stored: string, options: readonly string[]) {
  const listed = stored === "" || options.includes(stored);
  return listed
    ? { mode: "select" as const, choice: stored, typed: "" }
    : { mode: "other" as const, choice: "__other__", typed: stored };
}

const MUSCLES = ["Chest", "Back", "Legs"] as const;

describe("opening on an existing value", () => {
  it("shows a listed value in the dropdown", () => {
    expect(openMode("Back", MUSCLES)).toEqual({ mode: "select", choice: "Back", typed: "" });
  });

  it("reopens a typed value in Other, with the value kept", () => {
    /* The failure this prevents: editing a row whose muscle is "Forearms",
       the control falls back to the first option, and saving quietly
       rewrites it to "Chest". */
    expect(openMode("Forearms", MUSCLES))
      .toEqual({ mode: "other", choice: "__other__", typed: "Forearms" });
  });

  it("treats empty as the blank option, not as typing", () => {
    expect(openMode("", MUSCLES).mode).toBe("select");
  });
});

describe("the sentinel", () => {
  it("cannot be confused with a real answer", () => {
    /* "Other" is a real gender answer. If the sentinel were the string
       "Other", choosing it would flip the control into typing mode and the
       submitted value would never be "Other" at all. */
    const GENDERS = ["Male", "Female", "Other"] as const;
    expect(openMode("Other", GENDERS)).toEqual({ mode: "select", choice: "Other", typed: "" });
    expect("__other__").not.toBe("Other");
  });
});

describe("what the action receives", () => {
  /* Exactly one field carries `name`: a hidden input in select mode, the text
     box in other mode. Never both, or the action reads an array. */
  function submitted(mode: "select" | "other", choice: string, typed: string) {
    return mode === "other" ? typed : choice;
  }

  it("sends the chosen option when one is picked", () => {
    expect(submitted("select", "Legs", "")).toBe("Legs");
  });

  it("sends the typed text when Other is picked", () => {
    expect(submitted("other", "__other__", "Kettlebell")).toBe("Kettlebell");
  });

  it("never sends the sentinel itself", () => {
    for (const [m, c, t] of [["select","Legs",""],["other","__other__","Sled"]] as const) {
      expect(submitted(m, c, t)).not.toBe("__other__");
    }
  });
});
