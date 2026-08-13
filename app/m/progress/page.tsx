import { createServerDb, requireActor } from "@/lib/db/server";
import { MemberTabBar } from "@/components/member/nav";
import { Screen } from "@/components/ui/primitives";
import { formatDate } from "@/lib/money";
import { LogMeasurement } from "./form";

/* ============================================================================
   M-26 / M-27 · Progress.

   Weight over time, strength over time, and a way to add today's numbers.

   The chart is inline SVG rather than a charting library: two series, thirty
   points, on the screen a member checks once a fortnight. A 40KB dependency
   would cost more than it explains.
   ========================================================================= */

export const dynamic = "force-dynamic";

interface Measurement {
  taken_on: string;
  weight_kg: string | null;
  body_fat_pct: string | null;
  chest_cm: string | null;
  waist_cm: string | null;
  biceps_cm: string | null;
  thigh_cm: string | null;
}

interface Best {
  name: string;
  weight_kg: number;
  reps: number;
  logged_at: string;
}

export default async function ProgressPage() {
  const actor = await requireActor();
  const db = await createServerDb();

  const { data: member } = await db
    .from("members")
    .select("id, target_weight_kg")
    .eq("gym_id", actor.gymId)
    .eq("user_id", actor.userId)
    .maybeSingle();

  const m = member as { id: string; target_weight_kg: string | null } | null;

  if (!m) {
    return (
      <>
        <Screen center tabBar><h1 className="text-[1.579em]">No member record</h1></Screen>
        <MemberTabBar current="/m/progress" />
      </>
    );
  }

  const [{ data: measurements }, { data: sets }, { data: sessions }] = await Promise.all([
    db
      .from("measurements")
      .select("taken_on, weight_kg, body_fat_pct, chest_cm, waist_cm, biceps_cm, thigh_cm")
      .eq("gym_id", actor.gymId)
      .eq("member_id", m.id)
      .order("taken_on", { ascending: true })
      .limit(60),
    db
      .from("set_logs")
      .select("weight_kg, reps, logged_at, exercises(name)")
      .eq("gym_id", actor.gymId)
      .order("weight_kg", { ascending: false })
      .limit(300),
    db
      .from("workout_sessions")
      .select("id")
      .eq("gym_id", actor.gymId)
      .eq("member_id", m.id)
      .not("completed_at", "is", null),
  ]);

  const rows = (measurements ?? []) as Measurement[];
  const latest = rows.at(-1) ?? null;
  const first = rows[0] ?? null;

  /* Heaviest set per exercise. RLS already limits set_logs to this member. */
  const bestByExercise = new Map<string, Best>();
  for (const s of (sets ?? []) as unknown as {
    weight_kg: string; reps: number; logged_at: string; exercises: { name: string } | null;
  }[]) {
    const name = s.exercises?.name;
    if (!name) continue;
    const w = Number(s.weight_kg);
    const cur = bestByExercise.get(name);
    if (!cur || w > cur.weight_kg) {
      bestByExercise.set(name, { name, weight_kg: w, reps: s.reps, logged_at: s.logged_at });
    }
  }
  const bests = [...bestByExercise.values()]
    .sort((a, b) => b.weight_kg - a.weight_kg)
    .slice(0, 6);

  const delta = (a: string | null | undefined, b: string | null | undefined) =>
    a != null && b != null ? Number(a) - Number(b) : null;

  const weightDelta = delta(latest?.weight_kg, first?.weight_kg);
  const fatDelta = delta(latest?.body_fat_pct, first?.body_fat_pct);

  return (
    <>
      <Screen tabBar>
        <h1 className="text-[1.842em]">Progress</h1>

        <div className="mt-5 grid grid-cols-3 gap-2.5">
          <Stat
            value={latest?.weight_kg ? `${Number(latest.weight_kg)}` : "—"}
            label="kg now"
            sub={weightDelta !== null
              ? `${weightDelta > 0 ? "+" : ""}${weightDelta.toFixed(1)} since start`
              : undefined}
          />
          <Stat
            value={latest?.body_fat_pct ? `${Number(latest.body_fat_pct)}` : "—"}
            label="% body fat"
            sub={fatDelta !== null
              ? `${fatDelta > 0 ? "+" : ""}${fatDelta.toFixed(1)}`
              : undefined}
          />
          <Stat value={(sessions ?? []).length} label="workouts" />
        </div>

        {rows.filter((r) => r.weight_kg).length >= 2 ? (
          <section className="mt-5 rounded-lg p-5" style={{ background: "var(--color-app-surface)" }}>
            <div className="flex items-baseline justify-between">
              <p className="text-[0.724em] tracking-[0.08em] uppercase"
                 style={{ color: "var(--app-ink-50)" }}>
                Weight
              </p>
              {m.target_weight_kg && (
                <p className="text-[0.757em]" style={{ color: "var(--app-ink-50)" }}>
                  Target {Number(m.target_weight_kg)} kg
                </p>
              )}
            </div>
            <WeightChart
              points={rows
                .filter((r) => r.weight_kg)
                .map((r) => ({ d: r.taken_on, v: Number(r.weight_kg) }))}
              target={m.target_weight_kg ? Number(m.target_weight_kg) : null}
            />
          </section>
        ) : (
          <p className="mt-5 text-[0.855em]" style={{ color: "var(--app-ink-55)" }}>
            Log your weight twice and a trend appears here.
          </p>
        )}

        {bests.length > 0 && (
          <>
            <h2 className="mt-8 text-[0.724em] tracking-[0.08em] uppercase"
                style={{ color: "var(--app-ink-50)" }}>
              Personal bests
            </h2>
            <ul className="mt-2">
              {bests.map((b) => (
                <li key={b.name}
                    className="flex items-center justify-between py-3 text-[0.888em]"
                    style={{ borderBottom: "1px solid var(--app-hairline)" }}>
                  <span className="min-w-0 flex-1 truncate">{b.name}</span>
                  <span className="font-semibold">
                    {b.weight_kg} kg × {b.reps}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}

        {latest && (
          <>
            <h2 className="mt-8 text-[0.724em] tracking-[0.08em] uppercase"
                style={{ color: "var(--app-ink-50)" }}>
              Latest measurements · {formatDate(latest.taken_on)}
            </h2>
            <ul className="mt-2">
              {([
                ["Chest", latest.chest_cm, first?.chest_cm],
                ["Waist", latest.waist_cm, first?.waist_cm],
                ["Biceps", latest.biceps_cm, first?.biceps_cm],
                ["Thigh", latest.thigh_cm, first?.thigh_cm],
              ] as const)
                .filter(([, v]) => v != null)
                .map(([label, v, base]) => {
                  const d = delta(v, base);
                  return (
                    <li key={label}
                        className="flex items-center justify-between py-3 text-[0.888em]"
                        style={{ borderBottom: "1px solid var(--app-hairline)" }}>
                      <span style={{ color: "var(--app-ink-70)" }}>{label}</span>
                      <span>
                        {Number(v)} cm{" "}
                        {d !== null && d !== 0 && (
                          <span className="text-[0.789em] text-app-good">
                            {d > 0 ? "+" : ""}{d.toFixed(1)}
                          </span>
                        )}
                      </span>
                    </li>
                  );
                })}
            </ul>
          </>
        )}

        <h2 className="mt-8 text-[0.724em] tracking-[0.08em] text-app-good uppercase">
          Log today
        </h2>
        <LogMeasurement
          memberId={m.id}
          previous={latest ? {
            weight: latest.weight_kg, fat: latest.body_fat_pct,
            chest: latest.chest_cm, waist: latest.waist_cm,
            biceps: latest.biceps_cm, thigh: latest.thigh_cm,
          } : null}
        />
      </Screen>

      <MemberTabBar current="/m/progress" />
    </>
  );
}

function Stat({ value, label, sub }: { value: string | number; label: string; sub?: string }) {
  return (
    <div className="rounded-md p-4" style={{ background: "var(--color-app-surface)" }}>
      <div className="text-[1.579em] leading-none font-bold tracking-[-0.02em]">{value}</div>
      <div className="mt-1 text-[0.724em]" style={{ color: "var(--app-ink-55)" }}>{label}</div>
      {sub && <div className="mt-0.5 text-[0.691em] text-app-good">{sub}</div>}
    </div>
  );
}

/** Inline SVG line chart. Scaled to the data plus the goal line, so the goal
 *  is always on screen rather than clipped off the bottom. */
function WeightChart({
  points, target,
}: { points: { d: string; v: number }[]; target: number | null }) {
  const W = 300, H = 110, PAD = 8;
  const values = [...points.map((p) => p.v), ...(target ? [target] : [])];
  const min = Math.min(...values) - 1;
  const max = Math.max(...values) + 1;
  const span = Math.max(0.1, max - min);

  const x = (i: number) =>
    PAD + (i / Math.max(1, points.length - 1)) * (W - PAD * 2);
  const y = (v: number) => PAD + (1 - (v - min) / span) * (H - PAD * 2);

  const line = points.map((p, i) => `${x(i)},${y(p.v).toFixed(1)}`).join(" ");

  return (
    <>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-3 h-[7.237em] w-full"
           role="img"
           aria-label={`Weight from ${points[0].v} to ${points.at(-1)!.v} kilograms`}>
        {target !== null && (
          <line x1="0" y1={y(target)} x2={W} y2={y(target)}
                stroke="rgb(174 191 146 / 0.5)" strokeWidth="1.5" strokeDasharray="4 5" />
        )}
        <polyline points={line} fill="none" stroke="var(--color-app-accent)"
                  strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx={x(points.length - 1)} cy={y(points.at(-1)!.v)} r="5"
                fill="var(--color-app-accent)" />
      </svg>
      <div className="flex justify-between text-[0.691em]" style={{ color: "var(--app-ink-40)" }}>
        <span>{formatDate(points[0].d)}</span>
        <span>{formatDate(points.at(-1)!.d)}</span>
      </div>
    </>
  );
}
