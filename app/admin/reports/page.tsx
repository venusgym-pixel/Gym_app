import Link from "next/link";
import { createServerDb, requireActor } from "@/lib/db/server";
import { gstEnabled } from "@/lib/tax";
import { BarChart } from "@/components/ui/chart";
import { Card, EmptyState, PageHeader, StatTile } from "@/components/admin/shell";
import { formatINR, formatINRCompact, formatDate } from "@/lib/money";

/* ============================================================================
   A-30 / A-31 / A-32 · Reports.

   Three reports on one page because they answer one question — is this gym
   getting healthier — and splitting them into three navigations means nobody
   compares them.

   Everything comes from reports_summary(), which runs as the caller. A
   manager has no `reports` grant at all, so RLS returns them nothing; the
   nav already hides the link, and this is what makes that real.
   ========================================================================= */

export const dynamic = "force-dynamic";

interface Summary {
  months: number;
  from: string;
  revenue: { label: string; paise: string; payments: number }[];
  by_plan: { name: string; paise: string; n: number }[];
  by_method: { method: string; paise: string; n: number }[];
  retention: { label: string; started: number; renewals: number; new: number }[];
  churned: number;
  by_weekday: { label: string; n: number }[];
  by_hour: { hour: number; n: number }[];
  visitors: number;
  visits: number;
  active: number;
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ months?: string }>;
}) {
  const actor = await requireActor();
  const db = await createServerDb();
  const params = await searchParams;
  const months = [3, 6, 12].includes(Number(params.months)) ? Number(params.months) : 6;

  const [{ data: summary }, gst] = await Promise.all([
    db.rpc("reports_summary", { p_gym_id: actor.gymId, p_months: months }),
    gstEnabled(),
  ]);

  const s = summary as unknown as Summary | null;

  if (!s) {
    return (
      <>
        <PageHeader eyebrow="Reports" title="Reports" />
        <Card>
          <EmptyState>
            You do not have access to reports. Ask the owner if you need them.
          </EmptyState>
        </Card>
      </>
    );
  }

  const totalPaise = s.revenue.reduce((t, r) => t + Number(r.paise), 0);
  const thisMonth = Number(s.revenue.at(-1)?.paise ?? 0);
  const lastMonth = Number(s.revenue.at(-2)?.paise ?? 0);
  const delta = lastMonth > 0 ? Math.round(((thisMonth - lastMonth) / lastMonth) * 100) : null;

  const startedTotal = s.retention.reduce((t, r) => t + r.started, 0);
  const renewalTotal = s.retention.reduce((t, r) => t + r.renewals, 0);
  const renewalRate = startedTotal > 0 ? Math.round((renewalTotal / startedTotal) * 100) : null;

  /* Visits per active member over four weeks. Below ~4 and renewals start
     failing regardless of what the revenue chart says. */
  const visitsPerMember = s.active > 0 ? (s.visits / s.active).toFixed(1) : "—";
  const peakHour = s.by_hour.reduce(
    (best, h) => (h.n > best.n ? h : best),
    { hour: 0, n: 0 },
  );

  return (
    <>
      <PageHeader
        eyebrow="Reports"
        title="How the gym is doing"
        sub={`Since ${formatDate(s.from)}.${gst ? " Amounts exclude GST." : ""}`}
        actions={
          <div className="flex gap-1 rounded-pill bg-neutral-200 p-1">
            {[3, 6, 12].map((m) => (
              <Link
                key={m}
                href={`/admin/reports?months=${m}`}
                className={`rounded-pill px-3 py-1 text-[12.5px] font-semibold ${
                  m === months ? "bg-neutral-900 text-neutral-100" : "text-neutral-700"
                }`}
              >
                {m}m
              </Link>
            ))}
          </div>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile value={formatINRCompact(totalPaise)} label={`Collected · ${months} months`} />
        <StatTile
          value={formatINRCompact(thisMonth)}
          label="This month"
          tone={delta !== null && delta < 0 ? "warn" : delta !== null ? "good" : "plain"}
          hint={delta === null ? "no prior month" : `${delta >= 0 ? "+" : ""}${delta}% vs last`}
        />
        <StatTile
          value={renewalRate === null ? "—" : `${renewalRate}%`}
          label="Renewal share"
          hint={`${renewalTotal} of ${startedTotal} new terms`}
        />
        <StatTile
          value={s.churned}
          label="Members lost"
          tone={s.churned > 0 ? "warn" : "plain"}
          hint="lapsed and never came back"
        />
      </div>

      {/* items-start, or grid rows stretch every card to the tallest in the
          row — which left half a screen of empty card under "New vs renewed"
          beside the taller attendance panel. */}
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Card title="Revenue by month">
          {totalPaise === 0 ? (
            <EmptyState>No payments recorded in this window.</EmptyState>
          ) : (
            <BarChart
              caption="Revenue by month"
              color="var(--color-accent-600)"
              surface="var(--color-surface)"
              height={160}
              format={(n) => formatINRCompact(n)}
              data={s.revenue.map((r) => ({
                label: r.label,
                full: r.label,
                value: Number(r.paise),
                sub: `${r.payments} payment${r.payments === 1 ? "" : "s"}`,
              }))}
            />
          )}
        </Card>

        <Card title="Where the money comes from">
          {s.by_plan.length === 0 ? (
            <EmptyState>Nothing to break down yet.</EmptyState>
          ) : (
            <>
              <Breakdown
                rows={s.by_plan.map((p) => ({
                  label: p.name,
                  value: Number(p.paise),
                  note: `${p.n}×`,
                }))}
              />
              <h3 className="mt-5 mb-2 font-mono text-[11px] tracking-[0.1em] text-neutral-600 uppercase">
                By method
              </h3>
              <Breakdown
                rows={s.by_method.map((m) => ({
                  label: m.method,
                  value: Number(m.paise),
                  note: `${m.n}×`,
                }))}
              />
            </>
          )}
        </Card>

        <Card title="New vs renewed">
          {s.retention.length === 0 ? (
            <EmptyState>No memberships started in this window.</EmptyState>
          ) : (
            <>
              <ul className="space-y-2">
                {s.retention.map((r) => {
                  const total = Math.max(1, r.started);
                  return (
                    <li key={r.label}>
                      <div className="mb-1 flex justify-between text-[12px]">
                        <span>{r.label}</span>
                        <span className="tabular text-neutral-700">
                          <span aria-hidden
                                className="mr-1 inline-block h-2 w-2 rounded-pill align-middle"
                                style={{ background: "var(--color-accent-600)" }} />
                          {r.renewals} renewed · {r.new} new
                        </span>
                      </div>
                      {/* A meter, not a two-colour stack.

                          This was sage against accent, and the two are not
                          far enough apart to tell one segment from the other:
                          measured, the pair sits at ΔE 12 in NORMAL vision —
                          below the 15 floor, so it is not a colourblindness
                          problem, it is a nobody problem. Every step of the
                          sage ramp also reads grey, so no combination of the
                          two brand hues fixes it.

                          Part-to-whole needs one hue anyway: the fill is what
                          renewed, the lighter track from the same ramp is the
                          rest, and both numbers are written beside it. One
                          colour, nothing to confuse, and no invented hue. */}
                      <div className="h-2.5 overflow-hidden rounded-[4px]"
                           style={{ background: "var(--color-accent-200)" }}>
                        <div
                          className="h-full"
                          style={{
                            width: `${(r.renewals / total) * 100}%`,
                            borderRadius: "0 4px 4px 0",
                            background: "var(--color-accent-600)",
                          }}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
              <p className="mt-3 text-[11.5px] text-neutral-600">
                <span className="text-sage-700">Green</span> is a member renewing,
                <span className="text-accent-700"> amber</span> is someone new.
                A gym living on new joins is refilling a leaking bucket.
              </p>
            </>
          )}
        </Card>

        <Card title="When the gym is busy">
          {s.visits === 0 ? (
            <EmptyState>No check-ins in the last four weeks.</EmptyState>
          ) : (
            <>
              <div className="mb-4 grid grid-cols-3 gap-3 text-center">
                <Mini value={String(s.visits)} label="visits · 4 weeks" />
                <Mini value={visitsPerMember} label="per active member" />
                <Mini
                  value={peakHour.n > 0 ? `${String(peakHour.hour).padStart(2, "0")}:00` : "—"}
                  label="busiest hour"
                />
              </div>

              <h3 className="mb-2 font-mono text-[11px] tracking-[0.1em] text-neutral-600 uppercase">
                By hour
              </h3>
              <BarChart
                caption="Check-ins by hour of day"
                color="var(--color-accent-600)"
                surface="var(--color-surface)"
                height={96}
                labelEvery={4}
                data={s.by_hour.map((h) => ({
                  label: String(h.hour).padStart(2, "0"),
                  full: `${String(h.hour).padStart(2, "0")}:00`,
                  value: h.n,
                  sub: `${h.n} check-in${h.n === 1 ? "" : "s"}`,
                }))}
              />

              <h3 className="mt-5 mb-2 font-mono text-[11px] tracking-[0.1em] text-neutral-600 uppercase">
                By weekday
              </h3>
              <Breakdown
                rows={s.by_weekday.map((d) => ({ label: d.label, value: d.n, raw: true }))}
              />
            </>
          )}
        </Card>
      </div>

      <p className="mt-5 text-[11.5px] text-neutral-600">
        Attendance covers the last 28 days regardless of the range above —
        four whole weeks, so a Monday is always compared against four Mondays.
      </p>
    </>
  );
}

/* ── chart primitives ─────────────────────────────────────────────────────── */

/* Same reasoning as the dashboard sparkline: a handful of divs beats a 40KB
   charting dependency, and bars must be direct flex children or their
   percentage heights resolve against an auto-height parent and collapse. */



function Breakdown({
  rows,
}: {
  rows: { label: string; value: number; note?: string; raw?: boolean }[];
}) {
  const peak = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="space-y-2">
      {rows.map((r) => (
        <li key={r.label}>
          <div className="mb-1 flex justify-between text-[12.5px]">
            <span className="capitalize">{r.label}</span>
            <span className="tabular text-neutral-700">
              {r.raw ? r.value : formatINR(r.value)}
              {r.note && <span className="ml-2 text-neutral-600">{r.note}</span>}
            </span>
          </div>
          {/* Square where it leaves the baseline, 4px rounded at the data
              end. A pill rounded at both ends puts a curve on the origin,
              which reads as the bar starting somewhere above zero. */}
          <div className="h-2 overflow-hidden rounded-[4px] bg-neutral-200">
            <div
              className="h-full"
              style={{
                width: `${(r.value / peak) * 100}%`,
                borderRadius: "0 4px 4px 0",
                background: "var(--color-accent-600)",
              }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

function Mini({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-md bg-bg p-2.5">
      <div className="tabular text-[18px] leading-none font-bold">{value}</div>
      <div className="mt-1 text-[10.5px] text-neutral-600">{label}</div>
    </div>
  );
}
