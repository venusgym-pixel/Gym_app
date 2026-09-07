"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Cta, Screen } from "@/components/ui/primitives";
import { WarmUp } from "./warmup";
import { NumPad } from "./numpad";
import { useWakeLock } from "./use-wake-lock";

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

interface DayOption {
  day_id: string;
  day_index: number;
  name: string;
  exercises: number;
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
  /** Every day in the plan, so a member can do a different one. */
  days?: DayOption[];
  /** True when this is a day they picked, not the one the split offered. */
  swapped?: boolean;
  /** Written by a coach for this member today, rather than the rotation. */
  from_trainer?: boolean;
  /** The coach's message for this session. */
  note?: string | null;
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

  /* Resuming skips the warm-up: an open session means they already started,
     and being sent back to "5 minutes easy cardio" after the app reloaded
     mid-set would be absurd. */
  const [phase, setPhase] = useState<"preview" | "warmup" | "logging" | "done">(
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

  /* Which number the pad is editing, or null for closed. */
  const [editing, setEditing] = useState<{ index: number; field: "weight" | "reps" } | null>(null);

  /* Held for the whole session, not just while logging: warming up is when
     the phone has been face-down on a bench longest. */
  useWakeLock(phase === "logging" || phase === "warmup");
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
      /* The session starts here, not after the warm-up, so time spent warming
         up counts as time in the gym and a member who closes the app mid
         warm-up can resume rather than losing the session. */
      setPhase("warmup");
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
      <Screen center tabBar>
        <h1 className="text-[1.711em]">No plan yet</h1>
        <p className="mt-2 max-w-[18.421em] text-[0.888em]" style={{ color: "var(--app-ink-55)" }}>
          Your trainer hasn&rsquo;t assigned a workout. Ask at reception and it
          will show up here.
        </p>
        <Link href="/m" className="mt-8 text-[0.822em] font-semibold text-app-accent">
          Back to home
        </Link>
      </Screen>
    );
  }

  /* ── M-16 done ────────────────────────────────────────────────────────── */

  if (phase === "done" && summary) {
    const totalSets = Number(summary.sets);
    return (
      <Screen tabBar>
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
          <h1 className="mt-5 text-[1.842em]">Workout complete</h1>
          <p className="mt-1.5 text-[0.855em]" style={{ color: "var(--app-ink-55)" }}>
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
            <p className="text-[0.724em] tracking-[0.08em] text-app-accent uppercase">
              Personal best
            </p>
            {summary.prs.map((pr) => (
              <p key={pr.exercise} className="mt-1 text-[0.921em] text-app-accent">
                {pr.exercise} — {Number(pr.weight_kg)} kg
              </p>
            ))}
          </div>
        )}

        <Link
          href="/m"
          className="mt-auto rounded-pill bg-app-accent py-4 text-center text-[1.053em] font-bold text-app-accent-ink"
        >
          Done
        </Link>
      </Screen>
    );
  }

  /* ── M-12a warm-up ────────────────────────────────────────────────────── */

  if (phase === "warmup") {
    return (
      <WarmUp
        dayName={today.day_name ?? "Today"}
        exercises={exercises.map((e) => ({
          name: e.name, muscle: e.muscle, equipment: e.equipment,
        }))}
        topKg={exercises[0] ? opener(exercises[0]) : 0}
        onDone={() => setPhase("logging")}
      />
    );
  }

  /* ── M-12 preview ─────────────────────────────────────────────────────── */

  if (phase === "preview") {
    const totalSets = exercises.reduce((n, e) => n + e.sets, 0);

    /* A rough clock, so a member can decide whether they have time for this
       before they start rather than at exercise four. Working sets are about
       45 seconds; the rest between them is prescribed, so the sum is close
       enough to be useful and is labelled "about" because it is not. */
    const seconds = exercises.reduce(
      (n, e) => n + e.sets * (45 + (e.rest_seconds ?? 90)),
      0,
    );
    const minutes = Math.round(seconds / 60 / 5) * 5;

    /* What to claim on a busy floor, and what the session actually trains.
       Both answer questions people currently have to open five rows to
       reason about. */
    const muscles = [...new Set(exercises.map((e) => e.muscle).filter(Boolean))];
    const kit = [...new Set(exercises.map((e) => e.equipment).filter(Boolean))];
    return (
      <Screen tabBar>
        <p className="text-[0.724em] tracking-[0.08em] text-app-good uppercase">
          {today.plan_name}
        </p>
        <h1 className="mt-2 text-[1.974em]">{today.day_name}</h1>
        <p className="mt-1.5 text-[0.855em]" style={{ color: "var(--app-ink-55)" }}>
          {today.from_trainer
            ? `${exercises.length} exercises · ${totalSets} sets`
            : `Day ${today.day_index} of ${today.day_count} · ${exercises.length} exercises · ${totalSets} sets`}
          {minutes > 0 && ` · about ${minutes} min`}
        </p>

        {/* Worth saying plainly. A session someone wrote for you by hand is
            not the same thing as the next slot in a rotation, and the numbers
            on it are meant to be followed rather than treated as a starting
            suggestion. */}
        {today.from_trainer && (
          <div className="mt-3 rounded-lg px-4 py-3"
               style={{ background: "var(--color-app-surface)" }}>
            <p className="text-[0.822em] font-semibold text-app-good">
              Set by your trainer for today
            </p>
            {today.note && (
              <p className="mt-1 text-[0.789em]" style={{ color: "var(--app-ink-55)" }}>
                {today.note}
              </p>
            )}
          </div>
        )}

        {muscles.length > 0 && (
          <div className="mt-3.5 flex flex-wrap gap-1.5">
            {muscles.map((m) => (
              <span key={m}
                    className="rounded-pill px-2.5 py-1 text-[0.724em] font-semibold"
                    style={{ background: "var(--app-fill)", color: "var(--app-ink-70)" }}>
                {m}
              </span>
            ))}
          </div>
        )}

        {kit.length > 0 && (
          <p className="mt-2 text-[0.757em]" style={{ color: "var(--app-ink-45)" }}>
            Needs: {kit.join(" · ")}
          </p>
        )}

        <ul className="mt-5 space-y-2">
          {exercises.map((e, i) => (
            <li
              key={e.exercise_id}
              className="flex items-center gap-3 rounded-lg p-3"
              style={{ background: "var(--color-app-surface)" }}
            >
              {/* A colour block with the movement's initial, rather than a
                  photograph nobody has taken. Colour is per muscle group, so
                  a push day reads as one family at a glance and costs no
                  assets to produce. */}
              <span
                aria-hidden
                className="grid h-[2.9em] w-[2.9em] shrink-0 place-items-center rounded-md text-[1.053em] font-bold"
                style={{
                  background: `var(--muscle-${(e.muscle ?? "").toLowerCase()}, var(--app-fill))`,
                  color: "var(--color-app-bg)",
                }}
              >
                {e.name.charAt(0).toUpperCase()}
              </span>

              <div className="min-w-0 flex-1">
                <p className="text-[0.921em] font-semibold">{e.name}</p>
                <p className="mt-0.5 text-[0.789em]" style={{ color: "var(--app-ink-55)" }}>
                  {e.sets} × {e.target_reps}
                  {e.target_weight_kg ? ` · ${Number(e.target_weight_kg)}kg` : ""}
                </p>
                {/* Last time, given its own line rather than trailing the
                    targets. It is the number that decides what happens on the
                    first set, so it should not be read last. */}
                <p className="mt-0.5 text-[0.757em] text-app-good">
                  {e.last
                    ? `Last time ${Number(e.last.weight_kg)}kg × ${e.last.reps}`
                    : "First time — start light"}
                </p>
              </div>

              <span className="shrink-0 text-[0.724em]" style={{ color: "var(--app-ink-40)" }}>
                {i + 1}
              </span>
            </li>
          ))}
        </ul>

        <DayPicker today={today} />

        {error && <Err>{error}</Err>}

        <Cta pinned onClick={begin} loading={busy}>
          Start {today.day_name}
        </Cta>
      </Screen>
    );
  }

  /* ── M-13 the logger ──────────────────────────────────────────────────── */

  const ex = exercises[index];
  if (!ex) return null;
  const sets = rows[ex.exercise_id] ?? [];
  const doneCount = sets.filter((s) => s.done).length;

  /* Across the whole session, for the progress bar in the header. */
  const allRows = Object.values(rows).flat();
  const sessionTotal = allRows.length;
  const sessionDone = allRows.filter((r) => r.done).length;
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
      <div className="mx-auto flex min-h-dvh max-w-[28.289em] flex-col">
        <header
          className="px-6 pt-[max(3rem,env(safe-area-inset-top))] pb-4"
          style={{ borderBottom: "1px solid var(--app-border)" }}
        >
          <div className="flex justify-between text-[0.789em]" style={{ color: "var(--app-ink-50)" }}>
            <span>Exercise {index + 1} of {exercises.length}</span>
            <span>{doneCount}/{sets.length} sets</span>
          </div>
          <h1 className="mt-2 text-[1.579em]">{ex.name}</h1>
          <p className="mt-1.5 text-[0.822em] text-app-good">{suggestion}</p>

          {/* Sets, not exercises. Counting exercises leaves the bar frozen
              for four minutes at a time; counting sets moves it often enough
              to read as progress, which is the whole point of showing it. */}
          <div className="mt-3 h-[3px] w-full overflow-hidden rounded-pill"
               style={{ background: "var(--app-fill)" }}>
            <div
              className="session-bar h-full origin-left rounded-pill"
              style={{
                background: "var(--color-app-good)",
                transform: `scaleX(${sessionTotal ? sessionDone / sessionTotal : 0})`,
              }}
            />
          </div>
        </header>

        <div className="flex-1 overflow-auto px-5 py-4">
          {/* Column header, so the three numbers are named once rather than
              each row carrying its own labels. */}
          <div className="mb-1.5 flex items-center gap-2 px-3 text-[0.691em] tracking-[0.06em] uppercase"
               style={{ color: "var(--app-ink-40)" }}>
            <span className="w-9">Set</span>
            <span className="w-[4.6em]">Last</span>
            <span className="flex-1 text-center">kg</span>
            <span className="flex-1 text-center">Reps</span>
            <span style={{ width: 56 }} />
          </div>

          {sets.map((s, i) => (
            <div
              key={i}
              className="set-row mb-2.5 flex items-center gap-2 rounded-md p-3"
              data-done={s.done}
              style={{
                background: s.done ? "var(--app-good-soft-2)" : "var(--color-app-surface)",
              }}
            >
              <span className="w-9 text-[0.822em] font-semibold">{i + 1}</span>

              {/* Last session's numbers for this exercise — the single most
                  useful field on the screen, and what makes progressive
                  overload possible without leaving it. */}
              <span className="w-[4.6em] text-[0.724em]" style={{ color: "var(--app-ink-45)" }}>
                {ex.last ? `${Number(ex.last.weight_kg)}×${ex.last.reps}` : "—"}
              </span>

              {/* Tap the number to edit it. The row arrives prefilled, so the
                  common case is no interaction with these at all. */}
              <Value
                value={`${s.weight}`}
                onClick={() => setEditing({ index: i, field: "weight" })}
              />
              <Value
                value={`${s.reps}`}
                onClick={() => setEditing({ index: i, field: "reps" })}
              />

              <button
                type="button"
                onClick={() => void toggleSet(ex, i)}
                aria-label={s.done ? `Undo set ${i + 1}` : `Log set ${i + 1}`}
                /* 56px, larger than the 48dp floor everything else uses.
                   It is pressed fifteen to thirty times a session with wet
                   hands, and a mis-tap corrupts the log. */
                className="set-tick grid shrink-0 rounded-pill"
                style={{
                  width: 56, height: 56, placeItems: "center",
                  background: s.done ? "var(--color-app-good)" : "transparent",
                  border: s.done ? "1px solid var(--color-app-good)"
                                 : "1px solid rgb(249 244 237 / 0.25)",
                  color: s.done ? "var(--color-app-accent-ink)" : "var(--app-ink-35)",
                }}
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
                     stroke="currentColor" strokeWidth="3.2" strokeLinecap="round">
                  <path d="M5 13l4 4L19 7" />
                </svg>
              </button>
            </div>
          ))}

          {error && <Err>{error}</Err>}
        </div>

        {/* Clears the tab bar, which did not exist when this screen was
            written. Inline like <Screen tabBar>, so a stray pb-* utility
            cannot win the cascade and bury Finish behind the bar again.

            The bar stays visible rather than being hidden for the duration:
            Prev, Next and Finish are the only controls here, so hiding it
            would leave someone mid-session with no way out but finishing a
            workout they may have opened by mistake. */}
        <div
          className="flex items-center gap-2.5 px-5 pt-3.5"
          style={{
            borderTop: "1px solid var(--app-border)",
            paddingBottom: "var(--tabbar-clearance)",
          }}
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

      {editing && (
        <NumPad
          title={`${ex.name} · set ${editing.index + 1}`}
          unit={editing.field === "weight" ? "kg" : "reps"}
          decimals={editing.field === "weight"}
          initial={
            editing.field === "weight"
              ? sets[editing.index].weight
              : sets[editing.index].reps
          }
          onCommit={(v) => {
            setRows((r) => ({
              ...r,
              [ex.exercise_id]: r[ex.exercise_id].map((row, n) =>
                n === editing.index
                  ? { ...row, [editing.field]: editing.field === "reps" ? Math.round(v) : v }
                  : row,
              ),
            }));
            setEditing(null);
          }}
          onClose={() => setEditing(null)}
        />
      )}

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

/* A number you tap to change. Reads as a value rather than a control,
   because most of the time it is already right and wants no attention. */
function Value({ value, onClick }: { value: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="value-cell flex-1 rounded-md py-2 text-center text-[1.118em] font-bold tracking-[-0.02em] tabular"
      style={{ background: "var(--app-fill)", color: "var(--color-app-ink)", minHeight: 48 }}
    >
      {value}
    </button>
  );
}

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
        <div className="text-[1.118em] font-bold tracking-[-0.02em]">{value}</div>
        <div className="text-[0.625em]" style={{ color: "var(--app-ink-40)" }}>{unit}</div>
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
      className="grid rounded-pill text-[1.184em] select-none"
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
      className="grid rounded-pill text-[0.855em] disabled:opacity-30"
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
      className="fixed inset-x-0 bottom-0 z-30 mx-auto flex max-w-[28.289em] flex-col items-center gap-4 px-6 pt-6 pb-[max(2.5rem,env(safe-area-inset-bottom))]"
      style={{
        background: "var(--color-app-surface)",
        borderRadius: "28px 28px 0 0",
        boxShadow: "0 -20px 50px rgb(0 0 0 / 0.5)",
      }}
    >
      <p className="text-[0.724em] tracking-[0.08em] uppercase" style={{ color: "var(--app-ink-50)" }}>
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
        <span className="text-[2.105em] font-bold tracking-[-0.02em]">
          {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}
        </span>
      </div>
      <div className="flex gap-2.5">
        <button type="button" onClick={onAdd}
                className="rounded-pill px-5 py-2.5 text-[0.855em]"
                style={{ border: "1px solid rgb(249 244 237 / 0.2)" }}>
          +30s
        </button>
        <button type="button" onClick={onSkip}
                className="rounded-pill bg-app-accent px-6 py-2.5 text-[0.888em] font-bold text-app-accent-ink">
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
      <div className="text-[1.711em] leading-none font-bold tracking-[-0.02em]"
           style={{ color: accent ? "var(--color-app-accent)" : undefined }}>
        {value}
      </div>
      <div className="mt-1 text-[0.757em]"
           style={{ color: accent ? "var(--color-app-accent)" : "var(--app-ink-55)" }}>
        {label}
      </div>
    </div>
  );
}

function Err({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className="mt-4 rounded-md px-4 py-3 text-[0.822em]"
       style={{ background: "rgb(246 160 107 / 0.12)", color: "var(--color-app-accent)" }}>
      {children}
    </p>
  );
}


/* ── choosing a different day ─────────────────────────────────────────────

   Collapsed by default. The offered day is right most of the time, and a list
   of five options above the start button turns a two-second decision into a
   menu.

   Nothing here is a "skip". The split rotates from the day you last FINISHED,
   so picking Legs today simply means Push is offered next — the programme
   swaps rather than losing a day, which is the difference between a member
   adapting around a busy Tuesday and a member quietly falling off a plan.
*/
function DayPicker({ today }: { today: Today }) {
  const [open, setOpen] = useState(false);
  const days = today.days ?? [];

  // Nothing to choose between on a one-day plan.
  if (days.length < 2) return null;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-5 w-full rounded-lg px-4 py-3 text-[0.855em] font-semibold"
        style={{ background: "var(--color-app-surface)", color: "var(--color-app-accent)" }}
      >
        {today.swapped ? "Choose another day" : "Doing something else today?"}
      </button>
    );
  }

  return (
    <div className="mt-5 rounded-lg p-1.5" style={{ background: "var(--color-app-surface)" }}>
      <p className="px-3 pt-2 pb-1 text-[0.757em]" style={{ color: "var(--app-ink-55)" }}>
        Pick what you are training. The rest of your split follows on from it.
      </p>
      {days.map((d) => {
        const current = d.day_id === today.day_id;
        return (
          <Link
            key={d.day_id}
            href={`/m/workout?day=${d.day_id}`}
            scroll={false}
            className="flex items-center gap-3 rounded-md px-3 py-3"
            style={{ background: current ? "var(--color-app-bg)" : undefined }}
          >
            <span className="min-w-0 flex-1">
              <span className="block text-[0.888em] font-semibold">{d.name}</span>
              <span className="block text-[0.757em]" style={{ color: "var(--app-ink-55)" }}>
                {d.exercises} exercise{d.exercises === 1 ? "" : "s"}
              </span>
            </span>
            {current && (
              <span className="text-[0.724em] font-semibold text-app-accent">Selected</span>
            )}
          </Link>
        );
      })}
    </div>
  );
}
