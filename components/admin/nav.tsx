"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { can, mayOpen, type Module } from "@/lib/auth/permissions";
import type { GymRole } from "@/lib/db/database.types";

/* ============================================================================
   Admin and trainer navigation.

   A client component for two reasons. It needs the pathname, and a layout —
   which is where the shell now lives — cannot read that on the server. And
   the mobile drawer needs open/closed state.

   Nav items are filtered by the permission matrix, so a receptionist simply
   does not see Reports or Staff. That is presentation only: RLS is what
   actually stops them reading it. Hiding a link the database would refuse
   anyway just avoids offering people dead ends.
   ========================================================================= */

interface NavItem {
  label: string;
  href: string;
  module: Module;
  /** Built and routable. Anything without this renders as muted text — a nav
   *  full of 404s is worse than one that admits what is still coming. */
  ready?: boolean;
}

const ADMIN_NAV: NavItem[] = [
  { label: "Dashboard",   href: "/admin",            module: "dashboard",   ready: true },
  { label: "Members",     href: "/admin/members",    module: "members",     ready: true },
  { label: "Leads",       href: "/admin/leads",      module: "leads",       ready: true },
  { label: "Plans",       href: "/admin/plans",      module: "memberships", ready: true },
  { label: "Payments",    href: "/admin/payments",   module: "payments",    ready: true },
  { label: "Attendance",  href: "/admin/attendance", module: "attendance",  ready: true },
  { label: "Kiosk",       href: "/admin/kiosk",      module: "attendance",  ready: true },
  { label: "Coaching",    href: "/trainer",          module: "workouts",    ready: true },
  { label: "Messaging",   href: "/admin/messaging",  module: "messaging",   ready: true },
  { label: "Reports",     href: "/admin/reports",    module: "reports",     ready: true },
  { label: "Staff",       href: "/admin/staff",      module: "staff",       ready: true },
  { label: "Settings",    href: "/admin/settings",   module: "settings",    ready: true },
];

/* Trainers get their own nav. Handing them the admin one meant every link
   pointed at a surface the proxy would immediately bounce them out of.

   Scheduling and trainer↔member chat are absent rather than greyed out: both
   need tables that do not exist (pt_sessions, message threads), and a nav
   item that has been "soon" for two releases teaches people to ignore the
   nav. They come back when the schema does. */
const TRAINER_NAV: NavItem[] = [
  { label: "Today",      href: "/trainer",           module: "dashboard", ready: true },
  { label: "Exercises",  href: "/trainer/exercises", module: "exercises", ready: true },
  { label: "Plans",      href: "/trainer/plans",     module: "workouts",  ready: true },
];

/** Longest-prefix match, so /admin/members/abc still highlights Members —
 *  exact matching left every detail page with nothing selected. */
function activeHref(pathname: string, items: NavItem[]): string | null {
  let best: string | null = null;
  for (const i of items) {
    if (pathname === i.href || pathname.startsWith(i.href + "/")) {
      if (!best || i.href.length > best.length) best = i.href;
    }
  }
  return best;
}

export function AdminNav({
  role, gymName, email,
}: {
  role: GymRole;
  gymName: string;
  email?: string | null;
}) {
  const pathname = usePathname() ?? "";

  /* The drawer records WHICH route it was opened on, and is open only while
     that is still the current route. Navigating therefore closes it with no
     effect and no extra render — closing it from a useEffect on pathname was
     a synchronous setState during an effect, which queues a cascading
     render before the new page has even painted. */
  const [openedOn, setOpenedOn] = useState<string | null>(null);
  const open = openedOn === pathname;

  const onTrainer = pathname.startsWith("/trainer");
  const items = (onTrainer ? TRAINER_NAV : ADMIN_NAV).filter((i) =>
    can(role, i.module, "view"),
  );
  const active = activeHref(pathname, items);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, [open]);

  const here = items.find((i) => i.href === active)?.label ?? "Menu";

  return (
    <>
      {/* ── phone: a collapsed bar, expanding to a drawer ──────────────────
          Twelve labels in a horizontally scrolling row ran into each other
          and hid most of themselves off-screen, with nothing to indicate
          there was anything to scroll to. */}
      <div className="md:hidden">
        <div
          className="sticky top-0 z-40 flex items-center gap-3 border-b border-neutral-300 px-4 py-3"
          style={{ background: "var(--color-surface)" }}
        >
          <div className="min-w-0 flex-1">
            <div className="truncate text-[15px] font-bold tracking-[-0.02em]">{gymName}</div>
            <div className="truncate font-mono text-[10px] tracking-[0.1em] text-neutral-600 uppercase">
              {role} · {here}
            </div>
          </div>

          <button
            type="button"
            onClick={() => setOpenedOn(open ? null : pathname)}
            aria-expanded={open}
            aria-controls="admin-drawer"
            /* 44px, the same touch-target floor the member tab bar uses. */
            className="grid h-11 w-11 shrink-0 place-items-center rounded-md border border-neutral-300"
          >
            <span className="sr-only">{open ? "Close menu" : "Open menu"}</span>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
              {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
            </svg>
          </button>
        </div>

        {open && (
          <>
            <button
              type="button" aria-hidden tabIndex={-1}
              onClick={() => setOpenedOn(null)}
              className="fixed inset-0 z-30 cursor-default"
              style={{ background: "rgb(24 22 18 / 0.45)" }}
            />
            <nav
              id="admin-drawer"
              className="fixed inset-x-0 top-[68px] z-40 max-h-[70dvh] overflow-y-auto border-b border-neutral-300 px-3 py-3 shadow-lg"
              style={{ background: "var(--color-surface)" }}
            >
              <ul className="grid grid-cols-2 gap-2">
                {items.map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active === item.href ? "page" : undefined}
                      className={`block rounded-md px-3 py-3 text-[14px] ${
                        active === item.href
                          ? "bg-neutral-900 font-semibold text-neutral-100"
                          : "bg-neutral-200 text-neutral-800"
                      }`}
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>

              {onTrainer && mayOpen(role, "admin") && (
                <Link href="/admin"
                      className="mt-2 block rounded-md px-3 py-3 text-[14px] text-neutral-700">
                  ← Back to admin
                </Link>
              )}

              <form action="/api/auth/signout" method="post" className="mt-3">
                <button
                  type="submit"
                  className="w-full rounded-md border border-neutral-300 px-3 py-3 text-[13px] font-semibold text-neutral-800"
                >
                  Sign out{email ? ` · ${email}` : ""}
                </button>
              </form>
            </nav>
          </>
        )}
      </div>

      {/* ── desktop sidebar ────────────────────────────────────────────────
          Sticky and exactly viewport-height: stretching with the page would
          push Sign out hundreds of pixels below the fold on a long table. */}
      <aside className="hidden flex-col border-neutral-300 bg-surface md:sticky md:top-0 md:flex md:h-dvh md:overflow-y-auto md:border-r">
        <div className="px-5 py-5">
          <div className="text-[17px] font-bold tracking-[-0.02em]">{gymName}</div>
          <div className="mt-0.5 font-mono text-[10px] tracking-[0.1em] text-neutral-600 uppercase">
            {role}
          </div>
        </div>

        <nav className="flex flex-col gap-1 px-3 pb-3">
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active === item.href ? "page" : undefined}
              className={`rounded-md px-3 py-2 text-[13.5px] whitespace-nowrap transition-colors ${
                active === item.href
                  ? "bg-neutral-900 font-semibold text-neutral-100"
                  : "text-neutral-800 hover:bg-neutral-200"
              }`}
            >
              {item.label}
            </Link>
          ))}

          {/* An owner supervising coaching needs a way back out. */}
          {onTrainer && mayOpen(role, "admin") && (
            <Link
              href="/admin"
              className="mt-3 rounded-md border-t border-neutral-300 px-3 pt-3 pb-2 text-[13.5px] whitespace-nowrap text-neutral-700 hover:bg-neutral-200"
            >
              ← Back to admin
            </Link>
          )}
        </nav>

        {/* A plain form post, so it works even if hydration failed — which is
            precisely when someone wants a way out. */}
        <div className="mt-auto border-t border-neutral-300 px-5 py-4">
          {email && (
            <p className="mb-2 truncate text-[11.5px] text-neutral-600" title={email}>
              {email}
            </p>
          )}
          <form action="/api/auth/signout" method="post">
            <button
              type="submit"
              className="w-full rounded-md border border-neutral-300 px-3 py-2 text-[12.5px] font-semibold text-neutral-800 transition-colors hover:bg-neutral-200"
            >
              Sign out
            </button>
          </form>
        </div>
      </aside>
    </>
  );
}
