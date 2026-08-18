"use client";

import Link from "next/link";
import { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";

/* ============================================================================
   Member bottom tab bar (ui-screens-spec §1.3).

   A client component living in app/m/layout.tsx, not a server component
   rendered per page. It used to be the latter, taking its active tab as a
   prop, which meant a tap did nothing at all until the server had rendered
   the whole next screen — around two seconds on a phone. Reading the path
   here instead lets the bar stay mounted and move the dot on tap, while the
   page underneath streams in behind its loading boundary.

   The QR button is the centre FAB and is visually the loudest thing on the
   screen, because checking in is the single most-used action in the whole
   product — spec rule 2: reachable in one tap from anywhere.
   ========================================================================= */

const TABS = [
  { href: "/m", label: "Home" },
  { href: "/m/workout", label: "Workout" },
  { href: "/m/progress", label: "Progress" },
  { href: "/m/more", label: "More" },
] as const;

export function MemberTabBar() {
  /* Sub-pages like /m/attendance are reached from a tile rather than a tab, so
     they match nothing here and no dot lights up. That is honest: none of the
     four tabs is where you are. */
  const current = usePathname();
  const [a, b, c, d] = TABS;

  /* The height GROWS by the safe-area inset rather than being padded inwards
     from a fixed 96px. With border-box sizing the old version let the home
     indicator eat 34px out of the bar on an installed iPhone, squashing the
     labels upward — which is why it looked wrong in the app but fine in a
     browser tab, where the inset is 0. */
  return (
    <nav
      className="app-scale fixed inset-x-0 bottom-0 z-20 mx-auto flex max-w-[29em] items-start justify-between border-t px-[1em]"
      style={{
        height: "var(--tabbar-total)",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
        background: "var(--color-app-bg-tabbar)",
        borderColor: "var(--app-hairline)",
      }}
    >
      <Tab {...a} current={current} />
      <Tab {...b} current={current} />

      <Link
        href="/m/checkin"
        aria-label="Check in"
        className="grid h-[4.2em] w-[4.2em] -translate-y-[1.8em] place-items-center rounded-pill bg-app-accent"
        style={{ boxShadow: "0 8px 24px rgb(198 113 57 / 0.45)" }}
      >
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none"
             stroke="var(--color-app-accent-ink)" strokeWidth="2.75" strokeLinecap="round">
          <rect x="3" y="3" width="7" height="7" rx="1.5" />
          <rect x="14" y="3" width="7" height="7" rx="1.5" />
          <rect x="3" y="14" width="7" height="7" rx="1.5" />
          <path d="M14 14h3v3M20 20h1M17 20v1" />
        </svg>
      </Link>

      <Tab {...c} current={current} />
      <Tab {...d} current={current} />
    </nav>
  );
}

/* A bare 10px text link gave a touch target about 13px tall — far under the
   44pt Apple and 48dp Google minimums, which is why the tabs felt like they
   needed aiming at. The link now fills the bar's full control height, so the
   target is the whole column even though the label is still small. */
function Tab({ href, label, current }: { href: string; label: string; current: string }) {
  const on = current === href;
  return (
    <Link
      href={href}
      aria-current={on ? "page" : undefined}
      className="flex w-[4.2em] flex-col items-center justify-center gap-[0.3em] text-[0.72em] font-medium"
      style={{
        height: "var(--tabbar-controls)",
        color: on ? "var(--color-app-accent)" : "var(--app-ink-45)",
      }}
    >
      <TabDot on={on} />
      {label}
    </Link>
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
