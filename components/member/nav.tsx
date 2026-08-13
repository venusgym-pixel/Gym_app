import Link from "next/link";

/* ============================================================================
   Member bottom tab bar (ui-screens-spec §1.3).

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

export function MemberTabBar({ current }: { current: string }) {
  const [a, b, c, d] = TABS;

  /* The height GROWS by the safe-area inset rather than being padded inwards
     from a fixed 96px. With border-box sizing the old version let the home
     indicator eat 34px out of the bar on an installed iPhone, squashing the
     labels upward — which is why it looked wrong in the app but fine in a
     browser tab, where the inset is 0. */
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-20 mx-auto flex max-w-[430px] items-start justify-between border-t px-4"
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
        className="grid h-16 w-16 -translate-y-7 place-items-center rounded-pill bg-app-accent"
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
      className="flex w-16 flex-col items-center justify-center gap-1 text-[10.5px] font-medium"
      style={{
        height: "var(--tabbar-controls)",
        color: on ? "var(--color-app-accent)" : "var(--app-ink-45)",
      }}
    >
      {/* A dot rather than an icon set: it marks the active tab at a glance
          without pretending to five icons that would each need drawing. */}
      <span
        aria-hidden
        className="h-1.5 w-1.5 rounded-pill transition-opacity"
        style={{
          background: "var(--color-app-accent)",
          opacity: on ? 1 : 0,
        }}
      />
      {label}
    </Link>
  );
}
