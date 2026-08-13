import type { MembershipStatus } from "@/lib/db/database.types";

/* ============================================================================
   One status component, six variants.

   ui-screens-spec.md §0.3 calls membership status "the spine of the product":
   it appears on ~20 screens, and it has to read correctly at 11px in a dense
   admin table and at 16px on a member's home screen. That is why this is a
   single component rather than a colour looked up at each call site — the
   alternative is six subtly different greens by the third sprint.
   ========================================================================= */

const VARIANTS: Record<
  MembershipStatus | "trial",
  { label: string; bg: string; fg: string }
> = {
  active:    { label: "Active",    bg: "bg-sage-200",    fg: "text-sage-800" },
  expiring:  { label: "Expiring",  bg: "bg-accent-200",  fg: "text-accent-800" },
  expired:   { label: "Expired",   bg: "bg-accent-300",  fg: "text-accent-900" },
  frozen:    { label: "Frozen",    bg: "bg-neutral-300", fg: "text-neutral-800" },
  cancelled: { label: "Cancelled", bg: "bg-neutral-200", fg: "text-neutral-700" },
  pending:   { label: "Pending",   bg: "bg-neutral-200", fg: "text-neutral-800" },
  trial:     { label: "Trial",     bg: "bg-sage-100",    fg: "text-sage-800" },
};

export function StatusChip({
  status,
  size = "sm",
}: {
  status: MembershipStatus | "trial";
  size?: "sm" | "md";
}) {
  const v = VARIANTS[status] ?? VARIANTS.pending;
  return (
    <span
      className={`${v.bg} ${v.fg} inline-flex items-center rounded-pill font-semibold whitespace-nowrap ${
        size === "sm" ? "px-2.5 py-0.5 text-[11px]" : "px-3 py-1 text-[13px]"
      }`}
    >
      {v.label}
    </span>
  );
}

/**
 * Days remaining, coloured by urgency.
 *
 * Split from StatusChip because "Expiring" and "3 days left" answer different
 * questions: one is the state machine, the other is how hard to chase. A gym
 * owner scanning the renewal worklist reads the number, not the label.
 */
export function DaysLeft({ days }: { days: number }) {
  const tone =
    days < 0 ? "text-accent-700"
    : days <= 3 ? "text-accent-700"
    : days <= 7 ? "text-accent-600"
    : "text-neutral-600";

  return (
    <span className={`${tone} text-[13px] font-semibold tabular`}>
      {days < 0
        ? `${Math.abs(days)}d ago`
        : days === 0
          ? "today"
          : `${days}d`}
    </span>
  );
}
