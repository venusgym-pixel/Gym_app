"use client";

import { useState } from "react";
import { Cta, Screen } from "@/components/ui/primitives";
import { rampSets } from "@/lib/warmup";

/* ============================================================================
   M-12a · Warm up, between tapping Start and logging the first set.

   Built on RAMP (Jeffreys, 2006) — Raise, Activate, Mobilise, Potentiate —
   which is the structure most coaching bodies now teach, and collapsed to
   three blocks because Activate and Mobilise are the same two minutes of
   movement to anyone who is not a strength coach.

   Specific to the session, not a poster. The mobility drills come from the
   muscles actually being trained today, and the ramp sets are computed from
   the weight this member is about to lift — a generic "warm up properly"
   screen is one people learn to tap through in a week.

   Skippable, and visibly so. The UX literature on fitness apps is blunt about
   this: a mandatory step before the thing someone came to do is where they
   drop out. A warm-up nobody can dismiss becomes a warm-up nobody reads.
   ========================================================================= */

interface Ex {
  name: string;
  muscle: string;
  equipment: string;
}

/* Two drills per group, chosen to need no kit beyond a band, because that is
   what is actually free on a gym floor at 7pm. */
const DRILLS: Record<string, string[]> = {
  Chest: ["Arm circles × 20", "Band pull-aparts × 15"],
  Back: ["Band pull-aparts × 15", "Cat-cow × 10"],
  Shoulders: ["Shoulder dislocates × 10", "Arm circles × 20"],
  Biceps: ["Arm swings × 20"],
  Triceps: ["Arm swings × 20", "Overhead reach × 10"],
  Legs: ["Bodyweight squats × 15", "Leg swings × 10 each side"],
  Glutes: ["Glute bridges × 15", "Leg swings × 10 each side"],
  Core: ["Dead bug × 10 each side"],
};

export function WarmUp({
  dayName,
  exercises,
  topKg,
  onDone,
}: {
  dayName: string;
  exercises: Ex[];
  /** The first working set's weight, so the ramp lands on it. */
  topKg: number;
  onDone: () => void;
}) {
  const [ticked, setTicked] = useState<Record<string, boolean>>({});

  const first = exercises[0];
  const barbell = (first?.equipment ?? "").toLowerCase().includes("barbell");
  const ramp = rampSets(topKg, barbell);

  /* The groups actually being trained, in the order they come up, capped at
     three — past that it is not a warm-up, it is a second workout. */
  const groups = [...new Set(exercises.map((e) => e.muscle))]
    .filter((m) => DRILLS[m])
    .slice(0, 3);

  const drills = [...new Set(groups.flatMap((g) => DRILLS[g]))].slice(0, 4);

  const minutes = 5 + (drills.length ? 3 : 0) + (ramp.length ? 2 : 0);

  function toggle(k: string) {
    setTicked((t) => ({ ...t, [k]: !t[k] }));
  }

  return (
    <Screen className="pb-32">
      <p className="text-[0.724em] tracking-[0.08em] text-app-good uppercase">
        Before you start
      </p>
      <h1 className="mt-2 text-[1.974em]">Warm up</h1>
      <p className="mt-1.5 text-[0.855em]" style={{ color: "var(--app-ink-55)" }}>
        {dayName} · about {minutes} minutes
      </p>

      <Block
        n={1}
        title="Raise"
        sub="Get warm and breathing harder."
        items={["5 minutes easy cardio — bike, rower or treadmill"]}
        ticked={ticked}
        toggle={toggle}
      />

      {drills.length > 0 && (
        <Block
          n={2}
          title="Mobilise"
          sub={groups.join(" · ") || "The muscles you are training"}
          items={drills}
          ticked={ticked}
          toggle={toggle}
        />
      )}

      {ramp.length > 0 && first && (
        <Block
          n={drills.length > 0 ? 3 : 2}
          title="Ramp up"
          sub={first.name}
          items={ramp.map((s) => `${s.weight}kg × ${s.reps}`)}
          ticked={ticked}
          toggle={toggle}
          footer={`Then your first working set at ${topKg}kg.`}
        />
      )}

      <Cta pinned onClick={onDone}>
        Done — start logging
      </Cta>

      <button
        type="button"
        onClick={onDone}
        className="mt-4 w-full text-center text-[0.822em] font-semibold"
        style={{ color: "var(--app-ink-45)" }}
      >
        Skip warm-up
      </button>
    </Screen>
  );
}

function Block({
  n, title, sub, items, ticked, toggle, footer,
}: {
  n: number;
  title: string;
  sub: string;
  items: string[];
  ticked: Record<string, boolean>;
  toggle: (k: string) => void;
  footer?: string;
}) {
  return (
    <section className="mt-5 rounded-lg px-4 py-3.5"
             style={{ background: "var(--color-app-surface)" }}>
      <div className="flex items-baseline gap-2">
        <span className="text-[0.789em] font-bold text-app-accent">{n}</span>
        <h2 className="text-[1.053em]">{title}</h2>
      </div>
      <p className="mt-0.5 text-[0.757em]" style={{ color: "var(--app-ink-50)" }}>
        {sub}
      </p>

      <ul className="mt-2.5 space-y-1">
        {items.map((it) => {
          const on = ticked[it] === true;
          return (
            <li key={it}>
              {/* Ticking is for keeping your place across eight minutes, not a
                  record — nothing is stored, and nothing gates on it. */}
              <button
                type="button"
                onClick={() => toggle(it)}
                className="flex w-full items-center gap-2.5 py-1.5 text-left"
              >
                <span
                  aria-hidden
                  className="grid h-[1.25em] w-[1.25em] shrink-0 place-items-center rounded-pill"
                  style={{
                    border: on ? "none" : "1.5px solid var(--app-border)",
                    background: on ? "var(--color-app-good)" : "transparent",
                  }}
                >
                  {on && (
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none"
                         stroke="var(--color-app-accent-ink)" strokeWidth="4" strokeLinecap="round">
                      <path d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </span>
                <span
                  className="text-[0.888em]"
                  style={{
                    color: on ? "var(--app-ink-45)" : "var(--color-app-ink)",
                    textDecoration: on ? "line-through" : undefined,
                  }}
                >
                  {it}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {footer && (
        <p className="mt-1.5 text-[0.757em]" style={{ color: "var(--app-ink-50)" }}>
          {footer}
        </p>
      )}
    </section>
  );
}
