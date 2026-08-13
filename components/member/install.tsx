"use client";

import { useEffect, useState } from "react";

/* ============================================================================
   Service-worker registration, plus the install prompt.

   Chrome fires `beforeinstallprompt` and, if you call preventDefault, hands
   you the event to trigger later. That is the only way to put "Install" on a
   button rather than leaving it buried in the browser's ⋮ menu — which is
   where members never find it.

   iOS has no such event and never will: Safari only installs through
   Share → Add to Home Screen, by hand. So iPhone users get instructions
   instead of a button, because a button that cannot work is worse than a
   sentence that explains.
   ========================================================================= */

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function InstallPrompt() {
  const [deferred, setDeferred] = useState<InstallPromptEvent | null>(null);
  const [isIOS, setIsIOS] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* Registration fails in private browsing and when the user has
           blocked storage. The app works fine without it — only offline
           assets and the Android install prompt are lost. */
      });
    }

    /* All the environment detection lives in here rather than the effect
       body, so nothing calls setState synchronously during the effect —
       that queues a second render before the first paint. */
    function detect() {
      /* Already installed: standalone display mode is the reliable signal on
         Android; navigator.standalone is Safari's non-standard equivalent. */
      const standalone =
        window.matchMedia("(display-mode: standalone)").matches ||
        (window.navigator as unknown as { standalone?: boolean }).standalone === true;
      if (standalone) { setInstalled(true); return; }

      setIsIOS(
        /iphone|ipad|ipod/i.test(navigator.userAgent) &&
          !/crios|fxios/i.test(navigator.userAgent),
      );
      setDismissed(localStorage.getItem("fitwell-install-dismissed") === "1");
    }
    detect();

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as InstallPromptEvent);
    };
    const onInstalled = () => { setInstalled(true); setDeferred(null); };

    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (installed || dismissed || (!deferred && !isIOS)) return null;

  function hide() {
    localStorage.setItem("fitwell-install-dismissed", "1");
    setDismissed(true);
  }

  return (
    <div
      className="flex items-start gap-3 rounded-lg px-4 py-3"
      style={{ background: "var(--color-app-surface)" }}
    >
      <div className="min-w-0 flex-1">
        <p className="text-[0.888em] font-semibold">Add Fitwell to your home screen</p>
        <p className="mt-0.5 text-[0.789em]" style={{ color: "var(--app-ink-55)" }}>
          {isIOS
            ? "Tap Share, then Add to Home Screen."
            : "Opens like an app, straight to your check-in code."}
        </p>
      </div>

      {deferred ? (
        <button
          type="button"
          onClick={async () => {
            await deferred.prompt();
            await deferred.userChoice;
            /* The event is single-use: Chrome will not let the same one be
               shown twice, so drop it either way. */
            setDeferred(null);
          }}
          className="shrink-0 rounded-pill bg-app-accent px-4 py-2 text-[0.822em] font-bold text-app-accent-ink"
        >
          Install
        </button>
      ) : (
        <button
          type="button"
          onClick={hide}
          aria-label="Dismiss"
          className="shrink-0 rounded-pill px-3 py-2 text-[0.822em]"
          style={{ color: "var(--app-ink-55)" }}
        >
          Got it
        </button>
      )}
    </div>
  );
}
