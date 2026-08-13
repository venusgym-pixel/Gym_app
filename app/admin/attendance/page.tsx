import Link from "next/link";
import { createServerDb, requireActor } from "@/lib/db/server";
import { AdminShell, Card, EmptyState, PageHeader, StatTile } from "@/components/admin/shell";
import { formatDate } from "@/lib/money";
import type { GymRole } from "@/lib/db/database.types";

/* ============================================================================
   A-21 · Attendance.

   The front-desk view: who is in today, and the fortnight's shape behind it.
   Manual check-in lives on the member profile rather than here — reception
   already has to find the person to know whether to let them in.
   ========================================================================= */

export const dynamic = "force-dynamic";

interface Visit {
  id: string;
  checked_in_at: string;
  method: string;
  membership_status: string | null;
  members: { id: string; full_name: string; member_code: string } | null;
}

const time = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-IN", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  });

export default async function AttendancePage() {
  const actor = await requireActor();
  const db = await createServerDb();

  const [{ data: gym }, { data: recent }] = await Promise.all([
    db.from("gyms").select("name").eq("id", actor.gymId).single(),
    db
      .from("attendance")
      .select(
        "id, checked_in_at, method, membership_status, members(id, full_name, member_code)",
      )
      .eq("gym_id", actor.gymId)
      .order("checked_in_at", { ascending: false })
      .limit(200),
  ]);

  const visits = (recent ?? []) as unknown as Visit[];

  /* Group by local date so the day boundary matches the gym's, not UTC's. */
  const dayKey = (iso: string) =>
    new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date(iso));
  const todayKey = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
  }).format(new Date());

  const byDay = new Map<string, Visit[]>();
  for (const v of visits) {
    const k = dayKey(v.checked_in_at);
    (byDay.get(k) ?? byDay.set(k, []).get(k)!).push(v);
  }

  const today = byDay.get(todayKey) ?? [];
  const uniqueToday = new Set(today.map((v) => v.members?.id)).size;
  const busiest = [...byDay.entries()].sort((a, b) => b[1].length - a[1].length)[0];

  return (
    <AdminShell
      role={actor.role as GymRole}
      gymName={(gym as { name: string } | null)?.name ?? "Your gym"}
      current="/admin/attendance"
    >
      <PageHeader
        eyebrow="Attendance"
        title={`${today.length} check-ins today`}
        sub="The most recent 200 visits."
        actions={
          <Link
            href="/admin/kiosk"
            className="rounded-pill bg-neutral-900 px-4 py-2 text-[13px] font-semibold text-neutral-100 hover:bg-neutral-800"
          >
            Open kiosk
          </Link>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile value={today.length} label="Check-ins today" />
        <StatTile value={uniqueToday} label="Unique members today" />
        <StatTile value={visits.length} label="Recent visits" />
        <StatTile
          value={busiest ? busiest[1].length : 0}
          label="Busiest day"
          hint={busiest ? formatDate(busiest[0]) : undefined}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <Card title={`Today · ${formatDate(new Date().toISOString())}`}>
          {today.length === 0 ? (
            <EmptyState>Nobody has checked in yet today.</EmptyState>
          ) : (
            <ul className="divide-y divide-neutral-300">
              {today.map((v) => (
                <li key={v.id} className="flex items-center gap-3 py-2.5 text-[13.5px]">
                  <span className="tabular w-16 text-neutral-600">
                    {time(v.checked_in_at)}
                  </span>
                  <Link
                    href={`/admin/members/${v.members?.id}`}
                    className="min-w-0 flex-1 truncate font-medium hover:underline"
                  >
                    {v.members?.full_name}
                  </Link>
                  <span className="font-mono text-[10.5px] text-neutral-600 uppercase">
                    {v.method}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Earlier">
          {byDay.size <= 1 ? (
            <EmptyState>No visits in the previous 13 days.</EmptyState>
          ) : (
            <ul className="divide-y divide-neutral-300">
              {[...byDay.entries()]
                .filter(([k]) => k !== todayKey)
                .sort((a, b) => (a[0] < b[0] ? 1 : -1))
                .map(([day, list]) => (
                  <li key={day} className="flex items-center gap-3 py-2.5 text-[13.5px]">
                    <span className="flex-1">{formatDate(day)}</span>
                    <span className="text-[12px] text-neutral-600">
                      {new Set(list.map((v) => v.members?.id)).size} members
                    </span>
                    <span className="tabular w-8 text-right font-semibold">
                      {list.length}
                    </span>
                  </li>
                ))}
            </ul>
          )}
        </Card>
      </div>
    </AdminShell>
  );
}
