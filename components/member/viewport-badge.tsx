"use client";

import { useEffect, useState } from "react";

/* ============================================================================
   Viewport readout for a real device, shown only with ?debug=1.

   public/diag.html already reports these numbers, but it is a static file
   with its own <meta viewport> — so it proves what a plain page gets, not
   what the app gets. When those two disagree the difference IS the bug, and
   there was no way to see it. This renders the same figures from inside the
   app, on the screen that actually looks wrong.

   Query-string gated rather than env-gated so it can be used against
   production, where the problem only appears.
   ========================================================================= */

export function ViewportBadge() {
  const [info, setInfo] = useState<string[] | null>(null);

  useEffect(() => {
    function read() {
      if (!new URLSearchParams(window.location.search).has("debug")) return;

      const standalone =
        window.matchMedia("(display-mode: standalone)").matches ||
        (window.navigator as unknown as { standalone?: boolean }).standalone === true;

      /* Read the tag as it stands NOW, after the runtime correction in
         app/layout.tsx has had its chance to rewrite it. */
      const meta = document
        .querySelector('meta[name="viewport"]')
        ?.getAttribute("content");

      setInfo([
        `innerWidth   ${window.innerWidth}`,
        `screen.width ${window.screen.width}`,
        `dpr          ${window.devicePixelRatio}`,
        `standalone   ${standalone}`,
        `meta         ${meta ?? "MISSING"}`,
      ]);
    }
    read();
  }, []);

  if (!info) return null;

  return (
    <pre
      className="fixed top-0 right-0 left-0 z-50 overflow-x-auto p-2 font-mono text-[10px] leading-snug whitespace-pre-wrap"
      style={{ background: "rgb(0 0 0 / 0.88)", color: "#aebf92" }}
    >
      {info.join("\n")}
    </pre>
  );
}
