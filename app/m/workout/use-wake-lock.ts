"use client";

import { useEffect } from "react";

/* ============================================================================
   Keep the screen on for the duration of a workout.

   A phone locking itself between sets is the loudest friction in a web-based
   gym app: you put it down to lift, pick it up, and have to unlock with
   chalky hands before you can log the set you just did.

   Two details the API demands and that are easy to miss:

     - The lock is released automatically whenever the document becomes
       hidden. Switching apps to answer a message therefore drops it silently,
       so it has to be re-acquired on visibilitychange or it only works until
       the first interruption.

     - It needs a secure context, and it does not exist at all on iOS Safari
       at the time of writing. Everything here is best-effort: a rejected
       promise or a missing API is a normal outcome, not an error worth
       showing anybody.
   ========================================================================= */

export function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    if (typeof navigator === "undefined" || !("wakeLock" in navigator)) return;

    let sentinel: WakeLockSentinel | null = null;
    let cancelled = false;

    const acquire = async () => {
      try {
        sentinel = await navigator.wakeLock.request("screen");
        if (cancelled) {
          await sentinel.release();
          sentinel = null;
        }
      } catch {
        /* Denied, unsupported, or the tab was not visible. Nothing to do and
           nothing worth saying — the workout still works, the screen just
           dims as it normally would. */
      }
    };

    const onVisible = () => {
      if (document.visibilityState === "visible") void acquire();
    };

    void acquire();
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      void sentinel?.release().catch(() => {});
    };
  }, [active]);
}
