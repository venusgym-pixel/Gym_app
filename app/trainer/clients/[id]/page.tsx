import Link from "next/link";
import { notFound } from "next/navigation";
import { createServerDb, requireActor } from "@/lib/db/server";
import { Card, EmptyState, PageHeader, StatTile } from "@/components/admin/shell";
import { formatDate } from "@/lib/money";
import { AssignPlan } from "./assign";

/* ============================================================================
   T-05 · Client detail — the review half of the coaching loop.

   The question a trainer opens this to answer is "did they do what I asked,
   and should the weight go up?". So sessions show ACTUAL against TARGET, and
   the progression suggestion sits next to each lift rather than in a
   separate screen.
   ========================================================================= */

export const dynamic = "force-dynamic";

interface SetRow {
  set_number: number;
  reps: number;
  weight_kg: string;
  target_reps: number | null;
  exercises: { id: string; name: string } | null;
}

interface Session {
  id: string;
  day_name: string;
  started_at: string;
  completed_at: string | null;
  feel_rating: number | null;
  member_note: string | null;
  set_logs: SetRow[];
}

export default async function ClientDetail({
  params,
}: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requireActor();
  const db = await createServerDb();

  const [{ data: member }, { data: plans }] = await Promise.all([
    db.from("members")
      .select("id, full_name, member_code, phone, goal, fitness_level")
      .eq("gym_id", actor.gymId).eq("id", id).maybeSingle(),
    db.from("workout_plans")
      .select("id, name, days_per_week")
      .eq("gym_id", actor.gymId).eq("is_active", true).order("name"),
  ]);

  if (!member) notFound();
  const m = member as {
    id: string; full_name: string; member_code: string; phone: string;
    goal: string | null; fitness_level: string | null;
  };

  const [{ data: assignment }, { data: sessions }, { data: measures }] = await Promise.all([
    db.from("workout_assignments")
      .select("plan_id, starts_on, workout_plans(name)")
      .eq("gym_id", actor.gymId).eq("member_id", id).is("ends_on", null).maybeSingle(),
    db.from("workout_sessions")
      .select(`id, day_name, started_at, completed_at, feel_rating, member_note,
               set_logs ( set_number, reps, weight_kg, target_reps, exercises ( id, name ) )`)
      .eq("gym_id", actor.gymId).eq("member_id", id)
      .order("started_at", { ascending: false }).limit(8),
    db.from("measurements")
      .select("taken_on, weight_kg, body_fat_pct")
      .eq("gym_id", actor.gymId).eq("member_id", id)
      .order("taken_on", { ascending: false }).limit(2),
  ]);

  const live = assignment as unknown as
    { plan_id: string; starts_on: string; workout_plans: { name: string } | null } | null;
  const list = (sessions ?? []) as unknown as Session[];
  const done = list.filter((s) => s.completed_at);

  /* Adherence over the sessions on screen: started vs actually finished.
     A member who starts and abandons is a different problem from one who
     never opens the app, and the number should tell them apart. */
  const adherence = list.length
    ? Math.round((done.length / list.length) * 100)
    : null;

  const totalVolume = done.reduce(
    (sum, s) => sum + s.set_logs.reduce((v, l) => v + l.reps * Number(l.weight_kg), 0),
    0,
  );

  /* Lifts where they missed the prescribed reps last time — the trainer's
     actual worklist for the next session. */
  const missed = new Map<string, { name: string; reps: number; target: number; weight: number }>();
  for (const s of done.slice(0, 1)) {
    for (const l of s.set_logs) {
      if (l.target_reps && l.reps < l.target_reps && l.exercises) {
        missed.set(l.exercises.name, {
          name: l.exercises.name, reps: l.reps,
          target: l.target_reps, weight: Number(l.weight_kg),
        });
      }
    }
  }

  const measureRows = (measures ?? []) as { taken_on: string; weight_kg: string | null; body_fat_pct: string | null }[];

  return (
    <>
      <PageHeader
        eyebrow={`${m.member_code}${m.goal ? ` · ${m.goal}` : ""}`}
        title={m.full_name}
        sub={m.phone}
        actions={
          <Link href="/trainer"
                className="rounded-pill border border-neutral-300 px-4 py-2 text-[13px] font-semibold hover:bg-neutral-200">
            All clients
          </Link>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile value={done.length} label="Sessions logged" />
        <StatTile value={adherence !== null ? `${adherence}%` : "—"} label="Finished what they started"
                  tone={adherence !== null && adherence < 60 ? "warn" : "plain"} />
        <StatTile value={Math.round(totalVolume).toLocaleString("en-IN")} label="kg lifted" />
        <StatTile
          value={measureRows[0]?.weight_kg ? Number(measureRows[0].weight_kg) : "—"}
          label="kg body weight"
          hint={measureRows[0] ? formatDate(measureRows[0].taken_on) : "not measured"}
        />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card title="Workout plan">
          {live ? (
            <p className="mb-4 text-[13.5px]">
              On <strong>{live.workout_plans?.name}</strong> since{" "}
              {formatDate(live.starts_on)}
            </p>
          ) : (
            <p className="mb-4 text-[13.5px] text-neutral-600">No plan assigned yet.</p>
          )}
          <AssignPlan
            memberId={m.id}
            plans={(plans ?? []) as { id: string; name: string; days_per_week: number }[]}
            currentPlanId={live?.plan_id ?? null}
          />
        </Card>

        <Card title="Adjust next session">
          {missed.size === 0 ? (
            <EmptyState>
              {done.length === 0
                ? "Nothing logged yet."
                : "They hit every prescribed rep last session — put the weight up."}
            </EmptyState>
          ) : (
            <ul className="divide-y divide-neutral-300">
              {[...missed.values()].map((x) => (
                <li key={x.name} className="flex items-center gap-3 py-2.5 text-[13px]">
                  <span className="min-w-0 flex-1 truncate font-medium">{x.name}</span>
                  <span className="tabular text-accent-700">
                    {x.reps}/{x.target} reps at {x.weight}kg
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="mt-4">
        <Card title="Recent sessions">
          {list.length === 0 ? (
            <EmptyState>Nothing logged yet. Assign a plan and it starts filling in.</EmptyState>
          ) : (
            <ul className="divide-y divide-neutral-300">
              {list.map((s) => {
                const volume = s.set_logs.reduce(
                  (v, l) => v + l.reps * Number(l.weight_kg), 0);
                return (
                  <li key={s.id} className="py-3">
                    <div className="flex items-center gap-3">
                      <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium">
                        {s.day_name}
                      </span>
                      <span className="text-[12px] text-neutral-600">
                        {formatDate(s.started_at)}
                      </span>
                      <span className="tabular text-[12.5px] font-semibold">
                        {Math.round(volume).toLocaleString("en-IN")} kg
                      </span>
                      {!s.completed_at && (
                        <span className="rounded-pill bg-neutral-200 px-2 py-0.5 text-[10.5px] text-neutral-700">
                          abandoned
                        </span>
                      )}
                    </div>

                    {s.set_logs.length > 0 && (
                      <p className="mt-1.5 text-[12px] text-neutral-600">
                        {[...new Set(s.set_logs.map((l) => l.exercises?.name))]
                          .filter(Boolean).slice(0, 4).join(" · ")}
                        {s.set_logs.length > 0 && ` · ${s.set_logs.length} sets`}
                      </p>
                    )}

                    {s.member_note && (
                      <p className="mt-1 text-[12px] text-accent-700">
                        &ldquo;{s.member_note}&rdquo;
                        {s.feel_rating && ` · felt ${s.feel_rating}/5`}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
