import Link from "next/link";
import { createServerDb, requireActor } from "@/lib/db/server";
import { MemberTabBar } from "@/components/member/nav";
import { InstallPrompt } from "@/components/member/install";
import { Screen } from "@/components/ui/primitives";
import { StatusChip } from "@/components/ui/status-chip";
import { formatDate, formatINR } from "@/lib/money";
import type { MembershipStatus } from "@/lib/db/database.types";

/* ============================================================================
   M-01 · Member home.

   The daily hub. Ordered by what the member actually opens the app for:
   check in, see how long is left, see their streak.

   Every tile goes somewhere real. Diet is the one card from the design still
   missing — those tables are Phase 3 — and it is absent rather than greyed
   out, because a placeholder that never becomes a feature trains people not
   to tap anything.
   ========================================================================= */

export const dynamic = "force-dynamic";

export default async function MemberHome() {
  const actor = await requireActor();
  const db = await createServerDb();

  const { data: member } = await db
    .from("members")
    .select(
      `id, full_name, member_code,
       memberships ( status, expires_on, started_on, plans ( name, price_paise ) )`,
    )
    .eq("gym_id", actor.gymId)
    .eq("user_id", actor.userId)
    .maybeSingle();

  const m = member as unknown as {
    id: string;
    full_name: string;
    member_code: string;
    memberships: {
      status: MembershipStatus;
      expires_on: string;
      started_on: string;
      plans: { name: string; price_paise: string } | null;
    }[];
  } | null;

  if (!m) {
    return (
      <>
        <Screen center tabBar>
          <h1 className="text-[1.711em]">No membership found</h1>
          <p className="mt-2 text-[0.888em]" style={{ color: "var(--app-ink-55)" }}>
            Your account isn&rsquo;t linked to a member record yet. Reception can
            fix this in a moment.
          </p>
        </Screen>
        <MemberTabBar current="/m" />
      </>
    );
  }

  const [
    { data: streakRow },
    { data: visitsRow },
    { data: recent },
    { data: listRows },
    { data: workoutRow },
    { data: weighIn },
  ] = await Promise.all([
    db.rpc("attendance_streak", { p_gym_id: actor.gymId, p_member_id: m.id }),
    db.rpc("visits_this_month", { p_gym_id: actor.gymId, p_member_id: m.id }),
    db
      .from("attendance")
      .select("checked_in_at")
      .eq("gym_id", actor.gymId)
      .eq("member_id", m.id)
      .order("checked_in_at", { ascending: false })
      .limit(1),
    /* RLS narrows this to the caller's own row, so it is the member's own
       record with days_left already computed by the database. */
    db.rpc("members_list", {
      p_gym_id: actor.gymId,
      p_status: null,
      p_search: null,
    }),
    db.rpc("todays_workout", { p_gym_id: actor.gymId, p_member_id: m.id }),
    db
      .from("measurements")
      .select("weight_kg")
      .eq("gym_id", actor.gymId)
      .eq("member_id", m.id)
      .not("weight_kg", "is", null)
      .order("taken_on", { ascending: false })
      .limit(1),
  ]);

  const workout = workoutRow as unknown as {
    assigned: boolean;
    plan_name?: string;
    day_name?: string;
    exercises?: unknown[];
  } | null;

  const latestWeight = (weighIn ?? [])[0]?.weight_kg as number | undefined ?? null;

  const self = ((listRows ?? []) as { id: string; days_left: number | null }[]).find(
    (r) => r.id === m.id,
  );

  const streak = Number(streakRow ?? 0);
  const visits = Number(visitsRow ?? 0);
  const lastVisit = (recent ?? [])[0]?.checked_in_at as string | undefined;

  const term = [...(m.memberships ?? [])].sort((a, b) =>
    a.expires_on < b.expires_on ? 1 : -1,
  )[0];

  /* days_left comes from Postgres (members_list), not the Node clock. A
     membership expiring today in Asia/Kolkata would read as tomorrow if this
     server ran UTC — and "1 day left" on a lapsed membership is how someone
     gets turned away at the door after the app told them they were fine. */
  const daysLeft = (self as { days_left: number | null } | undefined)?.days_left ?? null;

  /* Progress along the term. Derived from two fixed dates and days_left, so
     no clock is read here either. Clamped, so a long-lapsed membership does
     not draw a bar wider than its track. */
  const termDays = term
    ? Math.max(
        1,
        Math.round(
          (Date.parse(term.expires_on) - Date.parse(term.started_on)) / 86_400_000,
        ),
      )
    : 1;
  const pct =
    daysLeft === null
      ? 0
      : Math.min(100, Math.max(0, ((termDays - daysLeft) / termDays) * 100));

  const firstName = m.full_name.split(" ")[0];

  return (
    <>
      <Screen tabBar className="gap-3.5">
        <header className="flex items-center gap-3">
          <div
            className="grid h-11 w-11 place-items-center rounded-pill text-[0.987em] font-semibold"
            style={{ background: "var(--color-app-avatar)", color: "var(--color-app-accent)" }}
          >
            {firstName.slice(0, 2).toUpperCase()}
          </div>
          <div className="flex-1">
            <p className="text-[0.789em]" style={{ color: "var(--app-ink-55)" }}>
              {m.member_code}
            </p>
            <h1 className="text-[1.316em] leading-tight">{firstName}</h1>
          </div>
        </header>

        {/* streak */}
        <div
          className="relative flex items-center gap-4 overflow-hidden rounded-lg px-5 py-4"
          style={{ background: "var(--app-streak)" }}
        >
          <div
            className="absolute -top-8 -right-8 h-28 w-28 rounded-pill"
            style={{ background: "rgb(255 255 255 / 0.09)" }}
            aria-hidden
          />
          <span className="text-[3.026em] leading-none font-bold tracking-[-0.02em] text-white">
            {streak}
          </span>
          <div className="flex flex-col">
            <span className="text-[0.855em] font-semibold text-white">
              day{streak === 1 ? "" : "s"} in a row
            </span>
            <span className="text-[0.757em]" style={{ color: "rgb(255 255 255 / 0.75)" }}>
              {visits} visit{visits === 1 ? "" : "s"} this month
              {lastVisit ? ` · last ${formatDate(lastVisit)}` : ""}
            </span>
          </div>
        </div>

        {/* membership */}
        <div className="rounded-lg p-5" style={{ background: "var(--color-app-surface)" }}>
          {term ? (
            <>
              <div className="flex items-center justify-between">
                <span className="text-[0.888em] font-semibold">
                  {term.plans?.name} · <StatusChip status={term.status} />
                </span>
                <span className="text-[1.316em] font-semibold text-app-accent">
                  {daysLeft !== null && daysLeft >= 0 ? daysLeft : 0}
                  <span
                    className="text-[0.789em] font-normal"
                    style={{ color: "var(--app-ink-55)" }}
                  >
                    {" "}
                    days left
                  </span>
                </span>
              </div>

              <div
                className="mt-3 h-2 overflow-hidden rounded-pill"
                style={{ background: "rgb(249 244 237 / 0.12)" }}
              >
                <div
                  className="h-full bg-app-accent"
                  style={{ width: `${pct}%` }}
                />
              </div>

              <div
                className="mt-2.5 flex justify-between text-[0.757em]"
                style={{ color: "var(--app-ink-50)" }}
              >
                <span>{formatDate(term.started_on)}</span>
                <span>Expires {formatDate(term.expires_on)}</span>
              </div>

              {daysLeft !== null && daysLeft <= 7 && (
                <Link
                  href="/m/membership"
                  className="mt-4 block rounded-pill bg-app-accent py-3 text-center text-[0.987em] font-bold text-app-accent-ink"
                >
                  {daysLeft < 0 ? "Renew now" : `Renew — ${daysLeft}d left`}
                </Link>
              )}
            </>
          ) : (
            <p className="text-[0.888em]" style={{ color: "var(--app-ink-55)" }}>
              No active membership. Speak to reception to get started.
            </p>
          )}
        </div>

        {/* check in */}
        <Link
          href="/m/checkin"
          className="rounded-lg px-5 py-4"
          style={{ background: "var(--color-app-surface)" }}
        >
          <p className="text-[0.724em] tracking-[0.08em] text-app-good uppercase">
            At the gym?
          </p>
          <p className="mt-1.5 text-[1.447em]">Scan to check in</p>
          <p className="mt-1 text-[0.822em]" style={{ color: "var(--app-ink-55)" }}>
            Point your camera at the code on the reception counter.
          </p>
        </Link>

        {/* today's workout */}
        <Link
          href="/m/workout"
          className="rounded-lg px-5 py-4"
          style={{ background: "var(--color-app-surface)" }}
        >
          <p className="text-[0.724em] tracking-[0.08em] uppercase" style={{ color: "var(--app-ink-55)" }}>
            {workout?.assigned ? workout.plan_name : "Training"}
          </p>
          <p className="mt-1.5 text-[1.447em]">
            {workout?.assigned ? workout.day_name : "No plan yet"}
          </p>
          <p className="mt-1 text-[0.822em]" style={{ color: "var(--app-ink-55)" }}>
            {workout?.assigned
              ? `${workout.exercises?.length ?? 0} exercises · tap to start`
              : "Ask your trainer to assign one."}
          </p>
        </Link>

        <div className="grid grid-cols-2 gap-2.5">
          <Tile href="/m/membership" label="Membership"
                value={term?.plans ? formatINR(term.plans.price_paise) : "—"} />
          <Tile href="/m/attendance" label="Visits this month" value={String(visits)} />
          <Tile href="/m/progress" label="Progress"
                value={latestWeight === null ? "Log" : `${latestWeight}kg`} />
          <Tile href="/m/more" label="Profile & help" value="More" />
        </div>

        {/* Renders nothing once installed, or where the browser cannot
            install at all — so it is not a banner everyone has to dismiss
            forever. It also registers the service worker. */}
        <InstallPrompt />
      </Screen>

      <MemberTabBar current="/m" />
    </>
  );
}

function Tile({ href, label, value }: { href: string; label: string; value: string }) {
  return (
    <Link
      href={href}
      className="rounded-md px-4 py-3.5"
      style={{ background: "var(--color-app-surface)" }}
    >
      <div className="text-[1.316em] font-bold tracking-[-0.02em]">{value}</div>
      <div className="mt-0.5 text-[0.757em]" style={{ color: "var(--app-ink-55)" }}>
        {label}
      </div>
    </Link>
  );
}
