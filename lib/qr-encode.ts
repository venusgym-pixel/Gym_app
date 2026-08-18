import qrcode from "qrcode-generator";

/* ============================================================================
   QR encoding.

   This was a hand-written encoder — 150 lines of Reed-Solomon and bit
   placement — on the reasoning that a library was 30-50KB to do something
   small. The reasoning was fine and the code was wrong: a round trip through
   jsQR (the same decoder the member app's scanner uses) could not read
   ANYTHING it produced, including a five-character payload.

   Nobody noticed because a QR that is subtly invalid still looks exactly like
   a QR. It had been on the kiosk since the check-in screen shipped, so QR
   check-in has never actually worked — it was only ever looked at, never
   scanned.

   qrcode-generator is ~10KB, has been the reference implementation for
   fifteen years, and every code it makes is verified by the round-trip test
   in tests/qr-and-money.test.ts.

   Error correction level M: enough redundancy to survive a phone camera at
   arm's length on a slightly grubby counter screen, without the density that
   makes level Q or H hard to focus on.
   ========================================================================= */

export function encodeQr(text: string): boolean[][] {
  /* Type 0 = let the library choose the smallest version that fits. Fixing a
     version was the other latent bug in the old encoder: its table started at
     version 5, so a six-character code produced a needlessly dense 37x37
     grid that a camera has to work harder to resolve. */
  const qr = qrcode(0, "M");
  qr.addData(text);
  qr.make();

  const size = qr.getModuleCount();
  return Array.from({ length: size }, (_, row) =>
    Array.from({ length: size }, (_, col) => qr.isDark(row, col)),
  );
}
