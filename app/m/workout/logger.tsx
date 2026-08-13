"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Cta, Screen } from "@/components/ui/primitives";

/* ============================================================================
   M-12 / M-13 / M-14 / M-16 · Preview, log, rest, done.

   One component for the whole session. Navigating between screens mid-workout
   would risk losing unsaved sets on a phone that backgrounds the tab.

   Design rules from ui-screens-spec §7: steppers rather than keyboards, 48px
   minimum targets, and the screen kept awake. Someone is doing this sweaty,
   one-handed, at arm's length, between sets.
   ========================================================================= */

interface Exercise {
  exercise_id: string;
  name: string;
  muscle: string;
  equipment: string;
  sets: number;
  target_reps: number;
  target_weight_kg: string | null;
  rest_seconds: number;
  last: { reps: number; weight_kg: string } | null;
}

interface Today {
  assigned: boolean;
  plan_name?: string;
  day_id?: string;
  day_name?: string;
  day_index?: number;
  day_count?: number;
  open_session_id?: string | null;
  exercises?: Exercise[];
}

interface SetRow {
  reps: number;
  weight: number;
  done: boolean;
}

type Summary = {
  day_name: string;
  minutes: number;
  sets: number;
  volume_kg: number;
  prs: { exercise: string; weight_kg: string }[];
};

/** Suggested opening weight: last time's, or the plan's target, or bare bar. */
function opener(ex: Exercise): number {
  if (ex.last) return Number(ex.last.weight_kg);
  if (ex.target_weight_kg) return Number(ex.target_weight_kg);
  return 20;
}

export function WorkoutLogger({ today }: { today: Today }) {
  const exercises = today.exercises ?? [];

  const [phase, setPhase] = useState<"preview" | "logging" | "done">(
    today.open_session_id ? "logging" : "preview",
  );
  const [sessionId, setSessionId] = useState<string | null>(today.open_session_id ?? null);
  const [index, setIndex] = useState(0);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [rows, setRows] = useState<Record<string, SetRow[]>>(() =>
    Object.fromEntries(
      exercises.map((e) => [
        e.exercise_id,
        Array.from({ length: e.sets }, () => ({
          reps: e.target_reps,
          weight: opener(e),
          done: false,
        })),
      ]),
    ),
  );

  const [rest, setRest] = useState<number | null>(null);
  const wakeLock = useRef<{ release: () => Promise<void> } | null>(null);

  /* Keep the screen on while logging. A phone that sleeps between sets means
     unlocking with wet hands every ninety seconds. */
  useEffect(() => {
    if (phase !== "logging") return;
    let released = false;

    const nav = navigator as Navigator & {
      wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> };
    };
    nav.wakeLock?.request("screen").then(
      (l) => { if (released) void l.release(); else wakeLock.current = l; },
      () => { /* denied or unsupported — not worth telling the member */ },
    );

    return () => {
      released = true;
      void wakeLock.current?.release();
      wakeLock.current = null;
    };
  }, [phase]);

  /* The updater clears the timer itself at 1, so the effect never calls
     setState synchronously on the way in — that would queue an extra render
     pass on every tick of the countdown. */
  useEffect(() => {
    if (rest === null) return;
    const t = setTimeout(
      () => setRest((r) => (r === null || r <= 1 ? null : r - 1)),
      1000,
    );
    return () => clearTimeout(t);
  }, [rest]);

  async function call(body: Record<string, unknown>) {
    const res = await fetch("/api/workout", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(String(res.status));
    return res.json();
  }

  async function begin() {
    setBusy(true); setError(null);
    try {
      const { sessionId: id } = await call({ action: "start", dayId: today.day_id });
      setSessionId(id);
      setPhase("logging");
    } catch {
      setError("Could not start. Check your connection and try again.");
    } finally { setBusy(false); }
  }

  async function toggleSet(ex: Exercise, i: number) {
    const row = rows[ex.exercise_id][i];
    const nextDone = !row.done;

    /* Optimistic: the tick must feel instant on bad gym wifi. If the write
       fails it is rolled back and said out loud — silently losing a set the
       member believes they logged is the worst outcome here. */
    setRows((r) => ({
      ...r,
      [ex.exercise_id]: r[ex.exercise_id].map((s, j) =>
        j === i ? { ...s, done: nextDone } : s),
    }));
    if (nextDone) setRest(ex.rest_seconds);

    if (!nextDone || !sessionId) return;

    try {
      await call({
        action: "log",
        sessionId,
        exerciseId: ex.exercise_id,
        setNumber: i + 1,
        reps: row.reps,
        weightKg: row.weight,
        targetReps: ex.target_reps,
      });
    } catch {
      setRows((r) => ({
        ...r,
        [ex.exercise_id]: r[ex.exercise_id].map((s, j) =>
          j === i ? { ...s, done: false } : s),
      }));
      setError("That set did not save. Tap it again.");
    }
  }

  function step(exId: string, i: number, field: "reps" | "weight", delta: number) {
    setRows((r) => ({
      ...r,
      [exId]: r[exId].map((s, j) =>
        j === i
          ? { ...s, [field]: Math.max(0, +(s[field] + delta).toFixed(1)) }
          : s),
    }));
  }

  async function finish() {
    if (!sessionId) return;
    setBusy(true);
    try {
      const { summary: s } = await call({ action: "finish", sessionId });
      setSummary(s as Summary);
      setPhase("done");
    } catch {
      setError("Could not finish. Your sets are saved — try again.");
    } finally { setBusy(false); }
  }

  /* ── nothing assigned ─────────────────────────────────────────────────── */

  if (!today.assigned) {
    return (
      <Screen center className="pb-32">
        <h1 className="text-[26px]">No plan yet</h1>
        <p className="mt-2 max-w-[280px] text-[13.5px]" style={{ color: "var(--app-ink-55)" }}>
          Your trainer hasn&rsquo;t assigned a workout. Ask at reception and it
          will show up here.
        </p>
        <Link href="/m" className="mt-8 text-[12.5px] font-semibold text-app-accent">
          Back to home
        </Link>
      </Screen>
    );
  }

  /* ── M-16 done ────────────────────────────────────────────────────────── */

  if (phase === "done" && summary) {
    const totalSets = Number(summary.sets);
    return (
      <Screen className="pb-32">
        <div className="text-center">
          <div
            className="mx-auto grid place-items-center rounded-pill"
            style={{ width: 88, height: 88, background: "var(--app-good-soft)" }}
          >
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none"
                 stroke="var(--color-app-good)" strokeWidth="2.75" strokeLinecap="round">
              <path d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="mt-5 text-[28px]">Workout complete</h1>
          <p className="mt-1.5 text-[13px]" style={{ color: "var(--app-ink-55)" }}>
            {summary.day_name} · {summary.minutes} min
          </p>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3">
          <Stat value={Number(summary.volume_kg).toLocaleString("en-IN")} label="kg total volume" />
          <Stat value={totalSets} label="sets logged" />
          <Stat value={summary.prs.length} label="new PRs" accent={summary.prs.length > 0} />
          <Stat value={Math.round(totalSets * 8)} label="kcal est." />
        </div>

        {summary.prs.length > 0 && (
          <div className="mt-4 rounded-lg p-4" style={{ background: "var(--app-accent-soft)" }}>
            <p className="text-[11px] tracking-[0.08em] text-app-accent uppercase">
              Personal best
            </p>
            {summary.prs.map((pr) => (
              <p key={pr.exercise} className="mt-1 text-[14px] text-app-accent">
                {pr.exercise} — {Number(pr.weight_kg)} kg
              </p>
            ))}
          </div>
        )}

        <Link
          href="/m"
          className="mt-auto rounded-pill bg-app-accent py-4 text-center text-[16px] font-bold text-app-accent-ink"
        >
          Done
        </Link>
      </Screen>
    );
  }

  /* ── M-12 preview ─────────────────────────────────────────────────────── */

  if (phase === "preview") {
    const totalSets = exercises.reduce((n, e) => n + e.sets, 0);
    return (
      <Screen className="pb-32">
        <p className="text-[11px] tracking-[0.08em] text-app-good uppercase">
          {today.plan_name}
        </p>
        <h1 className="mt-2 text-[30px]">{today.day_name}</h1>
        <p className="mt-1.5 text-[13px]" style={{ color: "var(--app-ink-55)" }}>
          Day {today.day_index} of {today.day_count} · {exercises.length} exercises ·{" "}
          {totalSets} sets
        </p>

        <ul className="mt-5">
          {exercises.map((e) => (
            <li
              key={e.exercise_id}
              className="flex items-center gap-3 py-3.5"
              style={{ borderBottom: "1px solid var(--app-hairline)" }}
            >
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-semibold">{e.name}</p>
                <p className="mt-0.5 text-[12px]" style={{ color: "var(--app-ink-55)" }}>
                  {e.sets} × {e.target_reps}
                  {e.last && ` · last ${Number(e.last.weight_kg)}kg × ${e.last.reps}`}
                </p>
              </div>
              <span className="text-[11px]" style={{ color: "var(--app-ink-40)" }}>
                {e.equipment}
              </span>
            </li>
          ))}
        </ul>

        {error && <Err>{error}</Err>}

        <Cta pinned onClick={begin} loading={busy}>
          Start workout
        </Cta>
      </Screen>
    );
  }

  /* ── M-13 the logger ──────────────────────────────────────────────────── */

  const ex = exercises[index];
  if (!ex) return null;
  const sets = rows[ex.exercise_id] ?? [];
  const doneCount = sets.filter((s) => s.done).length;
  const volume = Object.entries(rows).reduce(
    (sum, [, list]) => sum + list.filter((s) => s.done).reduce((v, s) => v + s.reps * s.weight, 0),
    0,
  );
  const suggestion = ex.last
    ? `Previous ${Number(ex.last.weight_kg)}×${ex.last.reps} → try ${
        opener(ex) + (["Legs", "Glutes", "Back"].includes(ex.muscle) ? 5 : 2.5)
      }`
    : `Target ${ex.sets} × ${ex.target_reps}`;

  return (
    <div className="surface-app relative min-h-dvh">
      <div className="mx-auto flex min-h-dvh max-w-[430px] flex-col">
        <header
          className="px-6 pt-[max(3rem,env(safe-area-inset-top))] pb-4"
          style={{ borderBottom: "1px solid var(--app-border)" }}
        >
          <div className="flex justify-between text-[12px]" style={{ color: "var(--app-ink-50)" }}>
            <span>Exercise {index + 1} of {exercises.length}</span>
            <span>{doneCount}/{sets.length} sets</span>
          </div>
          <h1 className="mt-2 text-[24px]">{ex.name}</h1>
          <p className="mt-1.5 text-[12.5px] text-app-good">{suggestion}</p>
        </header>

        <div className="flex-1 overflow-auto px-5 py-4">
          {sets.map((s, i) => (
            <div
              key={i}
              className="mb-2.5 flex items-center gap-2 rounded-md p-3"
              style={{
                background: s.done ? "var(--app-good-soft-2)" : "var(--color-app-surface)",
              }}
            >
              <div className="w-12">
                <p className="text-[12.5px] font-semibold">Set {i + 1}</p>
                {ex.last && (
                  <p className="text-[10.5px]" style={{ color: "var(--app-ink-45)" }}>
                    {Number(ex.last.weight_kg)}×{ex.last.reps}
                  </p>
                )}
              </div>

              <Stepper
                value={`${s.weight}`}
                unit="kg"
                onDown={() => step(ex.exercise_id, i, "weight", -2.5)}
                onUp={() => step(ex.exercise_id, i, "weight", 2.5)}
              />
              <Stepper
                value={`${s.reps}`}
                unit="reps"
                small
                onDown={() => step(ex.exercise_id, i, "reps", -1)}
                onUp={() => step(ex.exercise_id, i, "reps", 1)}
              />

              <button
                type="button"
                onClick={() => void toggleSet(ex, i)}
                aria-label={s.done ? `Undo set ${i + 1}` : `Log set ${i + 1}`}
                className="ml-auto grid rounded-pill"
                style={{
                  width: 44, height: 44, placeItems: "center",
                  background: s.done ? "var(--color-app-good)" : "transparent",
                  border: s.done ? "1px solid var(--color-app-good)"
                                 : "1px solid rgb(249 244 237 / 0.25)",
                  color: s.done ? "var(--color-app-accent-ink)" : "var(--app-ink-35)",
                }}
              >
                <svg width="19" height="19" viewBox="0 0 24 24" fill="none"
                     stroke="currentColor" strokeWidth="3.2" strokeLinecap="round">
                  <path d="M5 13l4 4L19 7" />
                </svg>
              </button>
            </div>
          ))}

          <div className="mt-4 flex justify-between text-[12px]" style={{ color: "var(--app-ink-50)" }}>
            <span>{doneCount} of {sets.length} sets</span>
            <span>{Math.round(volume)} kg logged</span>
          </div>

          {error && <Err>{error}</Err>}
        </div>

        <div
          className="flex items-center gap-2.5 px-5 pt-3.5 pb-[max(1.75rem,env(safe-area-inset-bottom))]"
          style={{ borderTop: "1px solid var(--app-border)" }}
        >
          <NavBtn disabled={index === 0} onClick={() => setIndex((i) => i - 1)}>Prev</NavBtn>
          {index === exercises.length - 1 ? (
            <Cta className="flex-1 !py-3.5" onClick={finish} loading={busy}>Finish</Cta>
          ) : (
            <Cta className="flex-1 !py-3.5" onClick={() => setIndex((i) => i + 1)}>
              Next exercise
            </Cta>
          )}
          <NavBtn
            disabled={index === exercises.length - 1}
            onClick={() => setIndex((i) => i + 1)}
          >
            Next
          </NavBtn>
        </div>
      </div>

      {rest !== null && (
        <RestSheet
          seconds={rest}
          total={ex.rest_seconds}
          onAdd={() => setRest((r) => (r ?? 0) + 30)}
          onSkip={() => setRest(null)}
        />
      )}
    </div>
  );
}

/* ── pieces ───────────────────────────────────────────────────────────────── */

function Stepper({
  value, unit, small, onDown, onUp,
}: {
  value: string; unit: string; small?: boolean;
  onDown: () => void; onUp: () => void;
}) {
  const size = small ? 34 : 38;
  return (
    <div className="flex items-center gap-1.5">
      <Tap size={size} onClick={onDown}>−</Tap>
      <div style={{ width: small ? 36 : 54, textAlign: "center" }}>
        <div className="text-[17px] font-bold tracking-[-0.02em]">{value}</div>
        <div className="text-[9.5px]" style={{ color: "var(--app-ink-40)" }}>{unit}</div>
      </div>
      <Tap size={size} onClick={onUp}>+</Tap>
    </div>
  );
}

function Tap({
  size, onClick, children,
}: { size: number; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="grid rounded-pill text-[18px] select-none"
      style={{
        width: size, height: size, placeItems: "center",
        background: "var(--app-fill)", color: "var(--color-app-ink)",
      }}
    >
      {children}
    </button>
  );
}

function NavBtn({
  disabled, onClick, children,
}: { disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="grid rounded-pill text-[13px] disabled:opacity-30"
      style={{
        width: 52, height: 48, placeItems: "center",
        border: "1px solid var(--app-border-strong)", color: "var(--app-ink-60)",
      }}
    >
      {children}
    </button>
  );
}

function RestSheet({
  seconds, total, onAdd, onSkip,
}: { seconds: number; total: number; onAdd: () => void; onSkip: () => void }) {
  const R = 54;
  const C = 2 * Math.PI * R;
  const span = Math.max(total, seconds);
  return (
    <div
      className="fixed inset-x-0 bottom-0 z-30 mx-auto flex max-w-[430px] flex-col items-center gap-4 px-6 pt-6 pb-[max(2.5rem,env(safe-area-inset-bottom))]"
      style={{
        background: "var(--color-app-surface)",
        borderRadius: "28px 28px 0 0",
        boxShadow: "0 -20px 50px rgb(0 0 0 / 0.5)",
      }}
    >
      <p className="text-[11px] tracking-[0.08em] uppercase" style={{ color: "var(--app-ink-50)" }}>
        Rest
      </p>
      <div className="relative grid place-items-center" style={{ width: 128, height: 128 }}>
        <svg width="128" height="128" viewBox="0 0 128 128"
             style={{ position: "absolute", transform: "rotate(-90deg)" }}>
          <circle cx="64" cy="64" r={R} fill="none"
                  stroke="rgb(249 244 237 / 0.12)" strokeWidth="9" />
          <circle cx="64" cy="64" r={R} fill="none" stroke="var(--color-app-accent)"
                  strokeWidth="9" strokeLinecap="round"
                  strokeDasharray={`${(C * (1 - seconds / span)).toFixed(1)} ${C.toFixed(1)}`} />
        </svg>
        <span className="text-[32px] font-bold tracking-[-0.02em]">
          {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}
        </span>
      </div>
      <div className="flex gap-2.5">
        <button type="button" onClick={onAdd}
                className="rounded-pill px-5 py-2.5 text-[13px]"
                style={{ border: "1px solid rgb(249 244 237 / 0.2)" }}>
          +30s
        </button>
        <button type="button" onClick={onSkip}
                className="rounded-pill bg-app-accent px-6 py-2.5 text-[13.5px] font-bold text-app-accent-ink">
          Skip rest
        </button>
      </div>
    </div>
  );
}

function Stat({
  value, label, accent,
}: { value: string | number; label: string; accent?: boolean }) {
  return (
    <div
      className="rounded-lg p-4"
      style={{ background: accent ? "var(--app-accent-soft)" : "var(--color-app-surface)" }}
    >
      <div className="text-[26px] leading-none font-bold tracking-[-0.02em]"
           style={{ color: accent ? "var(--color-app-accent)" : undefined }}>
        {value}
      </div>
      <div className="mt-1 text-[11.5px]"
           style={{ color: accent ? "var(--color-app-accent)" : "var(--app-ink-55)" }}>
        {label}
      </div>
    </div>
  );
}

function Err({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className="mt-4 rounded-md px-4 py-3 text-[12.5px]"
       style={{ background: "rgb(246 160 107 / 0.12)", color: "var(--color-app-accent)" }}>
      {children}
    </p>
  );
}
