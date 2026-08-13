import Link from "next/link";
import { createServerDb, requireActor } from "@/lib/db/server";
import { AdminShell, Card, EmptyState, PageHeader, StatTile } from "@/components/admin/shell";
import { DaysLeft } from "@/components/ui/status-chip";
import { formatDate, formatINRCompact } from "@/lib/money";
import type { GymRole } from "@/lib/db/database.types";

/* ============================================================================
   A-01 · Admin dashboard.

   The screen the owner opens every morning, so it answers the four questions
   they actually have — how many members, who is about to lapse, who has
   stopped coming, and how much came in — before anything else.

   All of it arrives from one dashboard_summary() call. Eleven separate
   queries would make the first screen of the day the slowest.
   ========================================================================= */

export const dynamic = "force-dynamic";

interface Summary {
  members: { total: number; active: number; expiring: number; expired: number;
             frozen: number; new_this_month: number };
  money: { revenue_month_paise: number; revenue_today_paise: number;
           pending_paise: number; pending_count: number };
  attendance: { today: number; series: { d: string; n: number }[] };
  expiring_soon: { member_id: string; name: string; phone: string; plan: string;
                   expires_on: string; days_left: number }[];
  at_risk: { member_id: string; name: string; phone: string;
             days_since: number; days_left: number }[];
  outbox: { queued: number; stuck: number; sent_today: number };
}

function greeting(): string {
  // Asia/Kolkata regardless of where the server runs — the greeting should
  // match the gym's morning, not the data centre's.
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", {
      hour: "numeric", hour12: false, timeZone: "Asia/Kolkata",
    }).format(new Date()),
  );
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export default async function AdminDashboard() {
  const actor = await requireActor();
  const db = await createServerDb();

  const [{ data: gym }, { data: summary }] = await Promise.all([
    db.from("gyms").select("name").eq("id", actor.gymId).single(),
    db.rpc("dashboard_summary", { p_gym_id: actor.gymId }),
  ]);

  const s = summary as Summary | null;
  const gymName = (gym as { name: string } | null)?.name ?? "Your gym";

  const today = new Intl.DateTimeFormat("en-IN", {
    weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Kolkata",
  }).format(new Date());

  return (
    <AdminShell role={actor.role as GymRole} gymName={gymName} current="/admin">
      <PageHeader
        eyebrow={today}
        title={`${greeting()}`}
        sub={`Here's where ${gymName} stands.`}
        actions={
          <Link
            href="/admin/members"
            className="rounded-pill bg-neutral-900 px-4 py-2 text-[13px] font-semibold text-neutral-100 hover:bg-neutral-800"
          >
            View members
          </Link>
        }
      />

      {!s ? (
        <Card><EmptyState>Could not load the summary. Refresh to try again.</EmptyState></Card>
      ) : (
        <>
          {/* ── the four numbers that matter ─────────────────────────────── */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile value={s.members.total} label="Members"
                      hint={`${s.members.new_this_month} joined this month`} />
            <StatTile value={s.members.active + s.members.expiring} label="Active memberships"
                      hint={s.members.frozen ? `${s.members.frozen} frozen` : undefined}
                      tone="good" />
            <StatTile value={s.members.expiring} label="Expiring in 30 days"
                      hint={s.members.expired ? `${s.members.expired} already lapsed` : undefined}
                      tone={s.members.expiring > 0 ? "warn" : "plain"} />
            <StatTile value={formatINRCompact(s.money.revenue_month_paise)}
                      label="Revenue this month"
                      hint={`${formatINRCompact(s.money.revenue_today_paise)} today`} />
          </div>

          <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile value={s.attendance.today} label="Checked in today" />
            <StatTile value={s.outbox.sent_today} label="Reminders sent today"
                      hint={s.outbox.queued ? `${s.outbox.queued} queued` : undefined} />
            <StatTile value={s.money.pending_count} label="Pending payments"
                      hint={s.money.pending_paise
                        ? formatINRCompact(s.money.pending_paise) + " outstanding"
                        : undefined}
                      tone={s.money.pending_count > 0 ? "warn" : "plain"} />
            <StatTile value={s.at_risk.length} label="Members at risk"
                      hint="7+ days since a visit"
                      tone={s.at_risk.length > 0 ? "warn" : "plain"} />
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-[1.15fr_1fr]">
            {/* ── attendance ─────────────────────────────────────────────── */}
            <Card title="Attendance · last 14 days">
              <AttendanceBars series={s.attendance.series} />
            </Card>

            {/* ── the renewal worklist ───────────────────────────────────── */}
            <Card
              title="Expiring soon"
              action={
                <span className="text-[11px] text-neutral-600">
                  {s.outbox.sent_today > 0
                    ? `${s.outbox.sent_today} chased automatically`
                    : "reminders run daily"}
                </span>
              }
            >
              {s.expiring_soon.length === 0 ? (
                <EmptyState>Nobody lapses in the next 30 days.</EmptyState>
              ) : (
                <ul className="divide-y divide-neutral-300">
                  {s.expiring_soon.map((m) => (
                    <li key={m.member_id} className="flex items-center gap-3 py-2.5">
                      <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium">
                        {m.name}
                      </span>
                      <span className="text-[12px] text-neutral-600">{m.plan}</span>
                      <DaysLeft days={m.days_left} />
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          {/* ── inactivity ───────────────────────────────────────────────── */}
          <div className="mt-4">
            <Card title="Members at risk">
              {s.at_risk.length === 0 ? (
                <EmptyState>Everyone active has trained in the last week.</EmptyState>
              ) : (
                <ul className="divide-y divide-neutral-300">
                  {s.at_risk.map((m) => (
                    <li key={m.member_id} className="flex items-center gap-3 py-2.5">
                      <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium">
                        {m.name}
                      </span>
                      <span className="text-[12px] text-neutral-600">
                        last visit {m.days_since}d ago
                      </span>
                      <DaysLeft days={m.days_left} />
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </>
      )}
    </AdminShell>
  );
}

/**
 * Fourteen bars, scaled to the busiest day.
 *
 * Deliberately not a charting library: this is one metric over two weeks, and
 * the point is spotting a quiet Tuesday at a glance. A 40KB dependency for
 * fourteen divs is a bad trade on the screen that loads first.
 */
function AttendanceBars({ series }: { series: { d: string; n: number }[] }) {
  const peak = Math.max(1, ...series.map((p) => p.n));
  const first = series[0]?.d;

  return (
    <div>
      {/* Bars are direct flex children so their percentage heights resolve
          against h-28. Wrapping each in an auto-height div collapses them to
          nothing — the chart renders, empty, and looks like there is no data. */}
      <div className="flex h-28 items-end gap-1.5">
        {series.map((p) => (
          <div
            key={p.d}
            className={`flex-1 rounded-sm transition-colors ${
              p.n > 0 ? "bg-accent-400 hover:bg-accent-500" : "bg-neutral-300"
            }`}
            style={{ height: `${Math.max(4, (p.n / peak) * 100)}%` }}
            title={`${p.n} check-in${p.n === 1 ? "" : "s"} on ${p.d}`}
          />
        ))}
      </div>
      <div className="mt-2 flex justify-between text-[10.5px] text-neutral-600">
        {/* The series already carries its own dates — reading the clock here
            would make the component impure for no benefit. */}
        <span>{first ? formatDate(first) : ""}</span>
        <span className="tabular">peak {peak}</span>
        <span>today</span>
      </div>
    </div>
  );
}
