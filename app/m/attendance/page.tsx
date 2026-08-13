import { createServerDb, requireActor } from "@/lib/db/server";
import { MemberTabBar } from "@/components/member/nav";
import { Screen } from "@/components/ui/primitives";
import { formatDate } from "@/lib/money";

/* ============================================================================
   M-11 · Attendance history.

   Consistency is the thing a member actually wants to see, so the screen
   leads with the streak and the weekday pattern rather than a list of
   timestamps. The list is underneath for anyone checking a specific day.
   ========================================================================= */

export const dynamic = "force-dynamic";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default async function AttendanceHistory() {
  const actor = await requireActor();
  const db = await createServerDb();

  const { data: member } = await db
    .from("members")
    .select("id")
    .eq("gym_id", actor.gymId)
    .eq("user_id", actor.userId)
    .maybeSingle();

  const memberId = (member as { id: string } | null)?.id;

  if (!memberId) {
    return (
      <>
        <Screen center tabBar>
          <h1 className="text-[24px]">No member record</h1>
        </Screen>
        <MemberTabBar current="/m/attendance" />
      </>
    );
  }

  const [{ data: visits }, { data: streak }, { data: monthly }] = await Promise.all([
    db
      .from("attendance")
      .select("id, checked_in_at, method")
      .eq("gym_id", actor.gymId)
      .eq("member_id", memberId)
      .order("checked_in_at", { ascending: false })
      .limit(60),
    db.rpc("attendance_streak", { p_gym_id: actor.gymId, p_member_id: memberId }),
    db.rpc("visits_this_month", { p_gym_id: actor.gymId, p_member_id: memberId }),
  ]);

  const rows = (visits ?? []) as { id: string; checked_in_at: string; method: string }[];

  /* Weekday histogram — which days they actually train. */
  const byWeekday = new Array(7).fill(0) as number[];
  for (const v of rows) {
    const local = new Date(
      new Date(v.checked_in_at).toLocaleString("en-US", { timeZone: "Asia/Kolkata" }),
    );
    byWeekday[(local.getDay() + 6) % 7]++; // Monday-first
  }
  const peak = Math.max(1, ...byWeekday);

  return (
    <>
      <Screen tabBar>
        <h1 className="text-[28px]">Your visits</h1>

        <div className="mt-5 grid grid-cols-3 gap-2.5">
          <Stat value={Number(streak ?? 0)} label="day streak" />
          <Stat value={Number(monthly ?? 0)} label="this month" />
          <Stat value={rows.length} label="recent total" />
        </div>

        <h2
          className="mt-8 text-[11px] tracking-[0.08em] uppercase"
          style={{ color: "var(--app-ink-50)" }}
        >
          When you train
        </h2>
        <div className="mt-3 flex h-24 items-end gap-2">
          {/* The column needs h-full: a percentage height resolves against
              the parent's height, and an auto-height parent collapses the bar
              to nothing — the same way the admin chart drew empty. */}
          {byWeekday.map((n, i) => (
            <div key={DAYS[i]} className="flex h-full flex-1 flex-col items-center gap-1.5">
              <div className="flex w-full flex-1 items-end">
                <div
                  className="w-full rounded-sm"
                  style={{
                    height: `${Math.max(4, (n / peak) * 100)}%`,
                    background: n > 0 ? "var(--color-app-accent)" : "rgb(249 244 237 / 0.12)",
                  }}
                  title={`${n} visits on a ${DAYS[i]}`}
                />
              </div>
              <span className="text-[10px]" style={{ color: "var(--app-ink-45)" }}>
                {DAYS[i]}
              </span>
            </div>
          ))}
        </div>

        <h2
          className="mt-8 text-[11px] tracking-[0.08em] uppercase"
          style={{ color: "var(--app-ink-50)" }}
        >
          History
        </h2>
        {rows.length === 0 ? (
          <p className="mt-4 text-[13.5px]" style={{ color: "var(--app-ink-55)" }}>
            No visits yet. Scan the code at reception to record your first one.
          </p>
        ) : (
          <ul className="mt-2">
            {rows.map((v) => (
              <li
                key={v.id}
                className="flex items-center justify-between py-3 text-[13.5px]"
                style={{ borderBottom: "1px solid var(--app-hairline)" }}
              >
                <span>{formatDate(v.checked_in_at)}</span>
                <span style={{ color: "var(--app-ink-55)" }}>
                  {new Date(v.checked_in_at).toLocaleTimeString("en-IN", {
                    hour: "numeric",
                    minute: "2-digit",
                    timeZone: "Asia/Kolkata",
                  })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Screen>

      <MemberTabBar current="/m/attendance" />
    </>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="rounded-md p-4" style={{ background: "var(--color-app-surface)" }}>
      <div className="text-[26px] leading-none font-bold tracking-[-0.02em]">{value}</div>
      <div className="mt-1 text-[11px]" style={{ color: "var(--app-ink-55)" }}>
        {label}
      </div>
    </div>
  );
}
