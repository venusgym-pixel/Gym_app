/* ============================================================================
   UPI intent links.

   `upi://pay?...` is the standard NPCI intent. Tapping one on a phone opens
   the app chooser — GPay, PhonePe, Paytm, a bank app — with the payee and the
   amount already filled in.

   Generated from the VPA the gym already stores rather than pasted by hand,
   for one reason that matters: the AMOUNT travels in the link. The payment
   audit found members sending the wrong figure and reception reconciling it
   afterwards, and a link built per plan removes the retyping that causes it.

   Two things this is NOT:

   It is not a guarantee of the amount. Every UPI app lets the payer edit the
   figure before paying, so reception still verifies against the bank — the
   link reduces mistakes, not fraud.

   It is not universal. Android resolves upi:// through its intent chooser
   reliably; on iOS the generic scheme frequently resolves to nothing at all,
   because the apps register their own. So this is an addition to the QR and
   the typed VPA, never a replacement — the fallbacks stay on screen.
   ========================================================================= */

/** `name@bank`, which is all a VPA is. Deliberately loose: handles vary
 *  wildly (okhdfcbank, ybl, paytm, upi) and rejecting a valid one is worse
 *  than passing a malformed one to an app that will say so itself. */
export function isVpa(value: string): boolean {
  return /^[a-zA-Z0-9._%+-]{2,64}@[a-zA-Z][a-zA-Z0-9.-]{1,32}$/.test(value.trim());
}

export interface UpiLinkInput {
  vpa: string;
  /** Shown as the payee in the UPI app, so it must be the gym's name. */
  payeeName: string;
  /** Paise, like every other amount in this product. Omit to let the payer
   *  type it — correct for "pay whatever you owe" rather than a fixed plan. */
  amountPaise?: number | string | null;
  /** Appears as the payment note, which is what the gym sees in its ledger. */
  note?: string | null;
}

/**
 * Build a `upi://pay` link, or null if the VPA is unusable.
 *
 * Null rather than a broken link: a button that opens an app with no payee is
 * worse than no button, because the member believes they have paid.
 */
export function buildUpiLink({
  vpa,
  payeeName,
  amountPaise,
  note,
}: UpiLinkInput): string | null {
  const pa = vpa.trim();
  if (!isVpa(pa)) return null;

  const params = new URLSearchParams();
  params.set("pa", pa);
  /* Trimmed hard. Some apps silently drop the whole intent when the payee
     name is long or carries punctuation they do not expect. */
  params.set("pn", payeeName.trim().slice(0, 40) || "Gym");

  if (amountPaise !== undefined && amountPaise !== null && amountPaise !== "") {
    const paise = Number(amountPaise);
    if (Number.isFinite(paise) && paise > 0) {
      /* Rupees with exactly two decimals. The spec wants a decimal string,
         and apps have been seen to reject "3200" where they accept
         "3200.00". */
      params.set("am", (paise / 100).toFixed(2));
      // Without cu some apps prompt for a currency that has one option.
      params.set("cu", "INR");
    }
  }

  if (note) params.set("tn", note.trim().slice(0, 50));

  /* URLSearchParams encodes a space as "+", which several UPI apps render
     literally in the payee name and the note. %20 is what they expect. */
  return `upi://pay?${params.toString().replace(/\+/g, "%20")}`;
}

/**
 * Pull the payee address out of a scanned UPI QR.
 *
 * Every UPI QR is a `upi://pay?pa=…` string, so the code the gym already has
 * taped to its counter carries the id we are asking them to type. Reading it
 * from the image they are uploading anyway removes the whole question of
 * where to find it — which for most owners means digging through GPay's
 * settings for a string they have never needed before.
 *
 * Returns null for anything that is not a UPI code, so a poster or a wifi QR
 * held up to the camera says so instead of silently filling in nonsense.
 */
export function vpaFromUpiPayload(text: string): string | null {
  const raw = text.trim();
  if (!/^upi:\/\//i.test(raw)) return null;

  /* Parsed by hand rather than with URL(): upi:// is not a hierarchical
     scheme, and browsers disagree about whether the query survives parsing. */
  const q = raw.slice(raw.indexOf("?") + 1);
  if (!q || q === raw) return null;

  const pa = new URLSearchParams(q).get("pa");
  if (!pa) return null;

  const vpa = decodeURIComponent(pa).trim();
  return isVpa(vpa) ? vpa : null;
}
