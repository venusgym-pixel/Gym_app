import { AdminNav } from "./nav";
import type { GymRole } from "@/lib/db/database.types";

/* ============================================================================
   Admin shell — the sidebar plus the content well.

   Rendered by app/admin/layout.tsx and app/trainer/layout.tsx, not by each
   page. When every page rendered it, the gym name was re-queried on every
   navigation, and the shell was part of the page's own output — so a
   loading.tsx would have blanked the navigation along with the content.
   Next keeps a layout mounted across route changes, so the sidebar now
   stays put and only the content area swaps.

   Which nav to show, and what is selected, is decided inside AdminNav from
   the pathname: a layout cannot read that on the server.
   ========================================================================= */

export function AdminShell({
  role,
  gymName,
  email,
  children,
}: {
  role: GymRole;
  gymName: string;
  /** Shown in the sidebar footer so it is obvious which account is active —
   *  reception and the owner often share a machine. */
  email?: string | null;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-dvh md:grid md:grid-cols-[232px_1fr]">
      <AdminNav role={role} gymName={gymName} email={email} />
      <main className="min-w-0 px-5 py-6 md:px-9 md:py-7">{children}</main>
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
