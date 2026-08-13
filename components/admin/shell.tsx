import Link from "next/link";
import { can, type Module } from "@/lib/auth/permissions";
import type { GymRole } from "@/lib/db/database.types";

/* ============================================================================
   Admin shell — persistent left sidebar, per ui-screens-spec §1.1.

   Nav items are filtered by the permission matrix, so a receptionist simply
   does not see Reports or Staff. That is presentation only: RLS is what
   actually stops them reading it. Hiding a link the database would refuse
   anyway just avoids offering people dead ends.

   Sections not yet built render as muted text rather than links. A nav full
   of 404s is worse than a nav that admits what is coming.
   ========================================================================= */

interface NavItem {
  label: string;
  href: string;
  module: Module;
  ready?: boolean;
}

const NAV: NavItem[] = [
  { label: "Dashboard",   href: "/admin",           module: "dashboard",   ready: true },
  { label: "Members",     href: "/admin/members",   module: "members",     ready: true },
  { label: "Memberships", href: "/admin/plans",     module: "memberships" },
  { label: "Payments",    href: "/admin/payments",  module: "payments" },
  { label: "Attendance",  href: "/admin/attendance", module: "attendance" },
  { label: "Trainers",    href: "/admin/staff",     module: "staff" },
  { label: "Leads",       href: "/admin/leads",     module: "leads" },
  { label: "Messaging",   href: "/admin/messaging", module: "messaging" },
  { label: "Reports",     href: "/admin/reports",   module: "reports" },
  { label: "Settings",    href: "/admin/settings",  module: "settings" },
];

export function AdminShell({
  role,
  gymName,
  current,
  children,
}: {
  role: GymRole;
  gymName: string;
  current: string;
  children: React.ReactNode;
}) {
  const visible = NAV.filter((i) => can(role, i.module, "view"));

  return (
    <div className="min-h-dvh md:grid md:grid-cols-[232px_1fr]">
      <aside className="border-b border-neutral-300 bg-surface md:min-h-dvh md:border-r md:border-b-0">
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
        </nav>
      </aside>

      <main className="min-w-0 px-6 py-7 md:px-9">{children}</main>
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
  value: string | number;
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
