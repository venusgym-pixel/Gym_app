import Link from "next/link";
import { createServerDb, requireActor } from "@/lib/db/server";
import { MemberTabBar } from "@/components/member/nav";
import { Screen } from "@/components/ui/primitives";
import { StatusChip } from "@/components/ui/status-chip";
import { formatDate, formatINR, gstSplit } from "@/lib/money";
import type { MembershipStatus } from "@/lib/db/database.types";

/* ============================================================================
   M-02 / M-03 · Membership, and what renewing costs.

   Online payment (M-04, M-05) needs the Razorpay integration, which needs the
   partner onboarding that has weeks of lead time. Until then this screen is
   honest about it: it shows the exact price including GST and the date the
   membership would run to, and tells the member reception can take it now.
   A "Pay" button that fails is worse than no button.
   ========================================================================= */

export const dynamic = "force-dynamic";

interface Term {
  id: string;
  status: MembershipStatus;
  started_on: string;
  expires_on: string;
  price_paise: string;
  plans: { name: string } | null;
}

interface Plan {
  id: string;
  name: string;
  duration_days: number;
  price_paise: string;
}

export default async function MembershipPage() {
  const actor = await requireActor();
  const db = await createServerDb();

  const { data: member } = await db
    .from("members")
    .select(
      `id, full_name,
       memberships ( id, status, started_on, expires_on, price_paise, plans ( name ) )`,
    )
    .eq("gym_id", actor.gymId)
    .eq("user_id", actor.userId)
    .maybeSingle();

  const m = member as unknown as { id: string; memberships: Term[] } | null;

  const [{ data: plans }, { data: invoices }] = await Promise.all([
    db
      .from("plans")
      .select("id, name, duration_days, price_paise")
      .eq("gym_id", actor.gymId)
      .eq("is_active", true)
      .eq("is_visible_to_members", true)
      .order("sort_order"),
    m
      ? db
          .from("invoices")
          .select("id, invoice_no, total_paise, issued_on")
          .eq("gym_id", actor.gymId)
          .eq("member_id", m.id)
          .order("issued_on", { ascending: false })
          .limit(6)
      : Promise.resolve({ data: [] }),
  ]);

  const terms = [...(m?.memberships ?? [])].sort((a, b) =>
    a.expires_on < b.expires_on ? 1 : -1,
  );
  const current = terms[0] ?? null;
  const daysLeft = current
    ? Math.round(
        (Date.parse(current.expires_on) - Date.parse(new Date().toDateString())) /
          86_400_000,
      )
    : null;

  /* Mirrors next_expiry(): renewing early keeps the unused tail. */
  const base =
    current && new Date(current.expires_on) > new Date()
      ? new Date(current.expires_on)
      : new Date();

  return (
    <>
      <Screen className="pb-32">
        <h1 className="text-[28px]">Membership</h1>

        {current ? (
          <div
            className="mt-5 rounded-lg p-5"
            style={{ background: "var(--color-app-surface)" }}
          >
            <div className="flex items-center justify-between">
              <span className="text-[18px]">{current.plans?.name}</span>
              <StatusChip status={current.status} size="md" />
            </div>
            <p className="mt-3 text-[13px]" style={{ color: "var(--app-ink-55)" }}>
              {formatDate(current.started_on)} – {formatDate(current.expires_on)}
            </p>
            <p
              className="mt-1 text-[13px]"
              style={{ color: daysLeft !== null && daysLeft <= 7 ? "var(--color-app-accent)" : "var(--app-ink-55)" }}
            >
              {daysLeft === null
                ? ""
                : daysLeft < 0
                  ? `Lapsed ${Math.abs(daysLeft)} days ago`
                  : `${daysLeft} days remaining`}
            </p>
          </div>
        ) : (
          <p className="mt-5 text-[13.5px]" style={{ color: "var(--app-ink-55)" }}>
            You do not have an active membership.
          </p>
        )}

        <h2 className="mt-8 text-[11px] tracking-[0.08em] text-app-good uppercase">
          {current ? "Renew" : "Choose a plan"}
        </h2>
        <p className="mt-1.5 text-[12.5px]" style={{ color: "var(--app-ink-50)" }}>
          Prices include 18% GST.
        </p>

        <div className="mt-4 flex flex-col gap-3">
          {((plans ?? []) as Plan[]).map((p) => {
            const split = gstSplit(Number(p.price_paise));
            const until = new Date(base.getTime() + p.duration_days * 86_400_000);
            return (
              <div
                key={p.id}
                className="rounded-lg p-5"
                style={{
                  background: "var(--color-app-surface)",
                  border: "1px solid var(--app-border)",
                }}
              >
                <div className="flex items-baseline justify-between">
                  <span className="text-[20px]">{p.name}</span>
                  <span className="text-[20px] font-bold text-app-accent">
                    {formatINR(split.totalPaise)}
                  </span>
                </div>
                <p className="mt-1.5 text-[12px]" style={{ color: "var(--app-ink-55)" }}>
                  {p.duration_days} days · would run to {formatDate(until.toISOString())}
                </p>
              </div>
            );
          })}
        </div>

        <p
          className="mt-5 rounded-md px-4 py-3 text-[12.5px]"
          style={{ background: "rgb(246 160 107 / 0.10)", color: "var(--color-app-accent)" }}
        >
          Online payment is coming. For now reception can take payment and your
          membership extends immediately — the unused days on your current term
          are kept.
        </p>

        {(invoices ?? []).length > 0 && (
          <>
            <h2 className="mt-8 text-[11px] tracking-[0.08em] uppercase"
                style={{ color: "var(--app-ink-50)" }}>
              Receipts
            </h2>
            <ul className="mt-3">
              {((invoices ?? []) as { id: string; invoice_no: string; total_paise: string; issued_on: string }[]).map((inv) => (
                <li
                  key={inv.id}
                  className="flex items-center justify-between py-2.5 text-[13px]"
                  style={{ borderBottom: "1px solid var(--app-hairline)" }}
                >
                  <span className="font-mono text-[11.5px]"
                        style={{ color: "var(--app-ink-55)" }}>
                    {inv.invoice_no}
                  </span>
                  <span style={{ color: "var(--app-ink-55)" }}>
                    {formatDate(inv.issued_on)}
                  </span>
                  <span className="font-semibold">{formatINR(inv.total_paise)}</span>
                </li>
              ))}
            </ul>
          </>
        )}

        <Link
          href="/m"
          className="mt-8 text-center text-[12.5px] font-semibold text-app-accent"
        >
          Back to home
        </Link>
      </Screen>

      <MemberTabBar current="/m/membership" />
    </>
  );
}
