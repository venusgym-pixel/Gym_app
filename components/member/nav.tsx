"use client";

import Link from "next/link";
import { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/* ============================================================================
   Member bottom tab bar (ui-screens-spec §1.3).

   A client component living in app/m/layout.tsx, not a server component
   rendered per page. It used to be the latter, taking its active tab as a
   prop, which meant a tap did nothing at all until the server had rendered
   the whole next screen — around two seconds on a phone. Reading the path
   here instead lets the bar stay mounted and move the dot on tap, while the
   page underneath streams in behind its loading boundary.

   Five tabs of equal weight, check-in among them. It used to be a raised
   circle half again the size of everything else, on the reasoning that
   checking in is the most-used action in the product. That is still true and
   it was still the wrong shape: the circle overhung the bar by 1.8em, so
   every scrolling screen had to reserve 3.4em of clearance it could never
   use for anything, and on a 915px phone that is a visible slice of the
   screen spent on one button's shadow.

   It hides on the way down and comes back on the way up — see Hiding below.
   ========================================================================= */

const TABS = [
  { href: "/m", label: "Home" },
  { href: "/m/workout", label: "Workout" },
  { href: "/m/checkin", label: "Check in", qr: true },
  { href: "/m/progress", label: "Progress" },
  { href: "/m/more", label: "More" },
] as const;

/* ── Hiding ──────────────────────────────────────────────────────────────
   Direction of travel, not a timer.

   A timer would hide the bar while someone is reading a stationary screen,
   and — worse — a screen with nothing to scroll would have no way to bring
   it back, because there is no gesture left to make. Tying it to scroll
   direction means a page that does not scroll never hides its own
   navigation, and the gesture that reveals it is the one people already
   make to look upward.

   The threshold exists because a list settling after a tap produces a few
   pixels of scroll in each direction, and a bar that flickers on every one
   of those is worse than one that never moves. */
const HIDE_AFTER = 24;   // px of downward travel before it goes
const SHOW_AFTER = 12;   // px upward to bring it straight back

function useHideOnScroll() {
  const [hidden, setHidden] = useState(false);
  const lastY = useRef(0);
  const anchor = useRef(0);

  useEffect(() => {
    lastY.current = window.scrollY;
    anchor.current = window.scrollY;
    let frame = 0;

    const onScroll = () => {
      if (frame) return;                       // one read per frame, never per event
      frame = requestAnimationFrame(() => {
        frame = 0;
        const y = window.scrollY;
        const down = y > lastY.current;

        // Anchor resets whenever direction changes, so the thresholds measure
        // travel in ONE direction rather than distance from the top.
        if (down !== (anchor.current < lastY.current)) anchor.current = lastY.current;

        /* Never hide at the very top: there is nothing above to reveal, and a
           bar that vanishes on the first flick of a short page looks broken. */
        if (down && y > 64 && y - anchor.current > HIDE_AFTER) setHidden(true);
        else if (!down && anchor.current - y > SHOW_AFTER) setHidden(false);

        lastY.current = y;
      });
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return hidden;
}

export function MemberTabBar() {
  /* Sub-pages like /m/attendance are reached from a tile rather than a tab, so
     they match nothing here and no tab lights up. That is honest: none of the
     five is where you are. */
  const current = usePathname();
  const hidden = useHideOnScroll();

  return (
    <nav
      data-hidden={hidden}
      className="app-scale fixed inset-x-0 bottom-0 z-20 mx-auto flex max-w-[29em] items-start justify-between border-t px-[0.5em] tabbar"
      style={{
        height: "var(--tabbar-total)",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
        background: "var(--color-app-bg-tabbar)",
        borderColor: "var(--app-hairline)",
      }}
    >
      {TABS.map((t) => (
        <Tab key={t.href} href={t.href} label={t.label}
             qr={"qr" in t ? t.qr : false} current={current} />
      ))}
    </nav>
  );
}

/* A bare 10px text link gave a touch target about 13px tall — far under the
   44pt Apple and 48dp Google minimums, which is why the tabs felt like they
   needed aiming at. The link fills the bar's full control height, so the
   target is the whole column even though the label is still small. */
function Tab({
  href, label, qr, current,
}: {
  href: string; label: string; qr: boolean; current: string;
}) {
  const on = current === href;
  return (
    <Link
      href={href}
      aria-current={on ? "page" : undefined}
      className="flex flex-1 flex-col items-center justify-center gap-[0.25em] text-[0.72em] font-medium"
      style={{
        height: "var(--tabbar-controls)",
        color: on || qr ? "var(--color-app-accent)" : "var(--app-ink-45)",
      }}
    >
      {qr ? <QrGlyph /> : <TabDot on={on} />}
      {label}
    </Link>
  );
}

/* Check-in keeps its icon and its accent colour — it is still the most-used
   action — but inside the same footprint as everything else. Prominence
   through contrast rather than through size. */
function QrGlyph() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden
         stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <path d="M14 14h3v3M20 20h1M17 20v1" />
    </svg>
  );
}

/* A dot rather than an icon set: it marks the active tab at a glance without
   pretending to five icons that would each need drawing.

   It also answers the tap. useLinkStatus reports the pending phase — after the
   press, before the URL changes — and Next skips that phase entirely for a
   route it has already prefetched. So on a warm tab this stays invisible and
   the dot simply moves; on a cold one it pulses, and the tap is never silent.

   Must be a child of the Link to see its status, which is why it is a separate
   component rather than markup inside Tab.

   The 100ms animation delay lives in globals.css, so a navigation that beats
   it shows nothing at all. */
function TabDot({ on }: { on: boolean }) {
  const { pending } = useLinkStatus();
  return (
    <span
      aria-hidden
      data-on={on}
      data-pending={pending && !on}
      className="tab-dot h-[0.35em] w-[0.35em] rounded-pill"
      style={{ background: "var(--color-app-accent)" }}
    />
  );
}
