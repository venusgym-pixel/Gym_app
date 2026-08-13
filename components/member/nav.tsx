import Link from "next/link";

/* ============================================================================
   Member bottom tab bar (ui-screens-spec §1.3).

   The QR button is the centre FAB and is visually the loudest thing on the
   screen, because checking in is the single most-used action in the whole
   product — spec rule 2: reachable in one tap from anywhere.
   ========================================================================= */

const TABS = [
  { href: "/m", label: "Home" },
  { href: "/m/membership", label: "Plan" },
  { href: "/m/attendance", label: "Visits" },
  { href: "/m/more", label: "More" },
] as const;

export function MemberTabBar({ current }: { current: string }) {
  const [a, b, c, d] = TABS;
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-20 mx-auto flex max-w-[430px] items-start justify-between border-t px-5 pt-3.5"
      style={{
        height: 96,
        background: "var(--color-app-bg-tabbar)",
        borderColor: "var(--app-hairline)",
        paddingBottom: "env(safe-area-inset-bottom)",
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

function Tab({ href, label, current }: { href: string; label: string; current: string }) {
  const on = current === href;
  return (
    <Link
      href={href}
      aria-current={on ? "page" : undefined}
      className="w-14 text-center text-[10px]"
      style={{ color: on ? "var(--color-app-accent)" : "var(--app-ink-45)" }}
    >
      {label}
    </Link>
  );
}
