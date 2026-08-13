import Link from "next/link";
import { can, mayOpen, type Module } from "@/lib/auth/permissions";
import type { GymRole } from "@/lib/db/database.types";

/* ============================================================================
   Admin shell — persistent left sidebar, per ui-screens-spec §1.1.

   Nav items are filtered by the permission matrix, so a receptionist simply
   does not see Reports or Staff. That is presentation only: RLS is what
   actually stops them reading it. Hiding a link the database would refuse
   anyway just avoids offering people dead ends.

   Every item here is built and routable. The `ready` flag stays because the
   next unfinished section will want it: unbuilt items render as muted text
   rather than links, since a nav full of 404s is worse than one that admits
   what is coming.
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

export function AdminShell({
  role,
  gymName,
  current,
  email,
  children,
}: {
  role: GymRole;
  gymName: string;
  current: string;
  /** Shown in the sidebar footer so it is obvious which account is active —
   *  reception and the owner often share a machine. */
  email?: string | null;
  children: React.ReactNode;
}) {
  /* Which nav depends on where you are, not only who you are: an owner
     browsing /trainer should see the coaching nav while they are there. */
  const onTrainer = current.startsWith("/trainer");
  const visible = (onTrainer ? TRAINER_NAV : ADMIN_NAV).filter((i) =>
    can(role, i.module, "view"),
  );

  return (
    <div className="min-h-dvh md:grid md:grid-cols-[232px_1fr]">
      {/* Sticky and exactly viewport-height on desktop: the sidebar stretching
          with the page would push Sign out hundreds of pixels below the fold
          on a long members table. */}
      <aside className="flex flex-col border-b border-neutral-300 bg-surface md:sticky md:top-0 md:h-dvh md:overflow-y-auto md:border-r md:border-b-0">
        <div className="px-5 py-5">
          <div className="text-[17px] font-bold tracking-[-0.02em]">{gymName}</div>
          <div className="mt-0.5 font-mono text-[10px] tracking-[0.1em] text-neutral-600 uppercase">
            {role}
          </div>
        </div>

        <nav className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-col md:overflow-visible">
          {visible.map((item) =>
            item.ready ? (
              <Link
                key={item.href}
                href={item.href}
                aria-current={current === item.href ? "page" : undefined}
                className={`rounded-md px-3 py-2 text-[13.5px] whitespace-nowrap transition-colors ${
                  current === item.href
                    ? "bg-neutral-900 font-semibold text-neutral-100"
                    : "text-neutral-800 hover:bg-neutral-200"
                }`}
              >
                {item.label}
              </Link>
            ) : (
              <span
                key={item.href}
                className="flex items-center gap-2 rounded-md px-3 py-2 text-[13.5px] whitespace-nowrap text-neutral-500"
                title="Not built yet"
              >
                {item.label}
                <span className="rounded-sm bg-neutral-200 px-1.5 py-px font-mono text-[9px] tracking-wider text-neutral-600 uppercase">
                  soon
                </span>
              </span>
            ),
          )}

          {/* An owner supervising coaching needs a way back out. */}
          {onTrainer && mayOpen(role, "admin") && (
            <Link
              href="/admin"
              className="rounded-md px-3 py-2 text-[13.5px] whitespace-nowrap text-neutral-700 hover:bg-neutral-200 md:mt-3 md:border-t md:border-neutral-300 md:pt-3"
            >
              ← Back to admin
            </Link>
          )}
        </nav>

        {/* Sign out. A plain form post, so it works even if hydration failed —
            which is precisely when someone wants a way out. */}
        <div className="mt-auto hidden border-t border-neutral-300 px-5 py-4 md:block">
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

      <main className="min-w-0 px-6 py-7 md:px-9">
        {children}

        {/* On narrow screens the sidebar collapses to a scrolling row, so the
            footer would be off-screen. Repeat the control at the end. */}
        <form action="/api/auth/signout" method="post" className="mt-10 md:hidden">
          <button
            type="submit"
            className="w-full rounded-md border border-neutral-300 px-3 py-2.5 text-[13px] font-semibold text-neutral-800"
          >
            Sign out{email ? ` · ${email}` : ""}
          </button>
        </form>
      </main>
    </div>
  );
}

/* ── page furniture ───────────────────────────────────────────────────────── */

export function PageHeader({
  eyebrow, title, sub, actions,
}: {
  eyebrow?: string;
  title: string;
  sub?: string;
  actions?: React.ReactNode;
}) {
  return (
    <header className="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow && (
          <p className="font-mono text-[11px] tracking-[0.12em] text-neutral-600 uppercase">
            {eyebrow}
          </p>
        )}
        <h1 className="mt-1.5 text-[32px] leading-tight">{title}</h1>
        {sub && <p className="mt-1 text-[13.5px] text-neutral-700">{sub}</p>}
      </div>
      {actions && <div className="flex gap-2">{actions}</div>}
    </header>
  );
}

export function Card({
  title, action, children, className = "",
}: {
  title?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-lg bg-surface p-5 ${className}`}>
      {(title || action) && (
        <div className="mb-4 flex items-center justify-between gap-3">
          {title && (
            <h2 className="font-mono text-[11px] tracking-[0.1em] text-neutral-600 uppercase">
              {title}
            </h2>
          )}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

/**
 * Big number, small label. `tone` is used sparingly — a tile that is always
 * amber stops meaning anything, so only genuinely actionable counts get it.
 */
export function StatTile({
  value, label, hint, tone = "plain",
}: {
  /** Usually a number, but the member profile puts a StatusChip here. */
  value: React.ReactNode;
  label: string;
  hint?: string;
  tone?: "plain" | "warn" | "good";
}) {
  const ring =
    tone === "warn" ? "ring-1 ring-accent-300"
    : tone === "good" ? "ring-1 ring-sage-300"
    : "";
  const fg =
    tone === "warn" ? "text-accent-700"
    : tone === "good" ? "text-sage-700"
    : "text-ink";

  return (
    <div className={`rounded-md bg-surface p-4 ${ring}`}>
      <div className={`text-[28px] leading-none font-bold tracking-[-0.02em] tabular ${fg}`}>
        {value}
      </div>
      <div className="mt-1.5 text-[12px] text-neutral-700">{label}</div>
      {hint && <div className="mt-0.5 text-[11px] text-neutral-600">{hint}</div>}
    </div>
  );
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <p className="py-6 text-center text-[13px] text-neutral-600">{children}</p>
  );
}
