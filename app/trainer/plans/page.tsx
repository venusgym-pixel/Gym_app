import Link from "next/link";
import { createServerDb, requireActor } from "@/lib/db/server";
import { can } from "@/lib/auth/permissions";
import type { GymRole } from "@/lib/db/database.types";
import { Card, EmptyState, PageHeader, StatTile } from "@/components/admin/shell";

/* ============================================================================
   T-06 · Workout plans.

   Shows each plan's full split — days, exercises, sets and reps — because a
   trainer choosing between "Push Pull Legs" and "Upper Lower" is choosing on
   contents, not on the name. Collapsed into <details> so the page stays a
   list until they want the detail.

   Assignment happens on the client page, not here: you assign a plan TO
   someone, and the decision needs their history next to it.
   ========================================================================= */

export const dynamic = "force-dynamic";

interface Item {
  id: string;
  position: number;
  sets: number;
  target_reps: number;
  target_weight_kg: number | null;
  rest_seconds: number;
  exercises: { name: string; primary_muscle: string } | null;
}

interface Day {
  id: string;
  day_index: number;
  name: string;
  workout_exercises: Item[];
}

interface Plan {
  id: string;
  name: string;
  goal: string | null;
  days_per_week: number;
  is_template: boolean;
  workout_days: Day[];
}

export default async function PlansPage() {
  const actor = await requireActor();
  const db = await createServerDb();

  const [{ data: plans }, { data: assignments }] = await Promise.all([
    db
      .from("workout_plans")
      .select(
        "id, name, goal, days_per_week, is_template, " +
          "workout_days(id, day_index, name, " +
          "workout_exercises(id, position, sets, target_reps, target_weight_kg, rest_seconds, " +
          "exercises(name, primary_muscle)))",
      )
      .eq("gym_id", actor.gymId)
      .eq("is_active", true)
      .order("name"),
    db
      .from("workout_assignments")
      .select("plan_id, member_id, members(full_name)")
      .eq("gym_id", actor.gymId)
      .is("ends_on", null),
  ]);

  const rows = (plans ?? []) as unknown as Plan[];
  const live = (assignments ?? []) as unknown as {
    plan_id: string;
    member_id: string;
    members: { full_name: string } | null;
  }[];

  const onPlan = new Map<string, string[]>();
  for (const a of live) {
    const list = onPlan.get(a.plan_id) ?? [];
    list.push(a.members?.full_name ?? "Someone");
    onPlan.set(a.plan_id, list);
  }

  return (
    <>
      <PageHeader
        eyebrow="Coaching"
        title="Workout plans"
        sub="Assign one from a client's page — their history belongs next to the choice."
        actions={
          can(actor.role as GymRole, "workouts", "create") ? (
            <Link
              href="/trainer/plans/new"
              className="rounded-pill bg-neutral-900 px-4 py-2 text-[13px] font-semibold text-neutral-100 hover:bg-neutral-800"
            >
              + New plan
            </Link>
          ) : undefined
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile value={rows.length} label="Plans" />
        <StatTile value={live.length} label="Members on a plan" />
        <StatTile
          value={rows.reduce((t, p) => t + p.workout_days.length, 0)}
          label="Training days defined"
        />
        <StatTile
          value={rows.reduce(
            (t, p) => t + p.workout_days.reduce((d, w) => d + w.workout_exercises.length, 0),
            0,
          )}
          label="Exercise slots"
        />
      </div>

      {rows.length === 0 ? (
        <Card>
          <EmptyState>
            No plans yet. Create one with <em>New plan</em> above — you pick the
            split, then fill each day from the exercise library.
          </EmptyState>
        </Card>
      ) : (
        <div className="space-y-3">
          {rows.map((p) => {
            const members = onPlan.get(p.id) ?? [];
            const days = [...p.workout_days].sort((a, b) => a.day_index - b.day_index);

            return (
              <Card key={p.id}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div>
                    <h2 className="text-[19px]">
                      <Link href={`/trainer/plans/${p.id}`} className="hover:underline">
                        {p.name}
                      </Link>
                    </h2>
                    {p.goal && <p className="text-[12.5px] text-neutral-700">{p.goal}</p>}
                  </div>
                  <div className="text-right text-[12px] text-neutral-700">
                    <div>
                      {p.days_per_week} days a week
                      {can(actor.role as GymRole, "workouts", "edit") && (
                        <>
                          {" · "}
                          <Link href={`/trainer/plans/${p.id}`} className="underline">
                            edit
                          </Link>
                        </>
                      )}
                    </div>
                    <div className={members.length ? "text-sage-700" : "text-neutral-600"}>
                      {members.length === 0
                        ? "nobody on it"
                        : `${members.length} member${members.length === 1 ? "" : "s"}`}
                    </div>
                  </div>
                </div>

                {members.length > 0 && (
                  <p className="mt-2 text-[11.5px] text-neutral-600">{members.join(" · ")}</p>
                )}

                {days.length === 0 ? (
                  <p className="mt-3 text-[12.5px] text-neutral-600">
                    No days defined — nothing would show on a member&rsquo;s phone.
                  </p>
                ) : (
                  <div className="mt-3 grid gap-2 md:grid-cols-3">
                    {days.map((d) => (
                      <details key={d.id} className="rounded-md bg-bg p-3">
                        <summary className="cursor-pointer list-none text-[13.5px] font-medium">
                          <span className="font-mono text-[10.5px] text-neutral-600">
                            Day {d.day_index}
                          </span>
                          <br />
                          {d.name}
                          <span className="ml-1 text-[11.5px] font-normal text-neutral-600">
                            ({d.workout_exercises.length})
                          </span>
                        </summary>
                        <ul className="mt-2 space-y-1">
                          {[...d.workout_exercises]
                            .sort((a, b) => a.position - b.position)
                            .map((x) => (
                              <li key={x.id} className="flex justify-between gap-2 text-[12px]">
                                <span className="min-w-0 truncate">
                                  {x.exercises?.name ?? "Removed exercise"}
                                </span>
                                <span className="tabular shrink-0 text-neutral-700">
                                  {x.sets}×{x.target_reps}
                                  {x.target_weight_kg ? ` @ ${x.target_weight_kg}kg` : ""}
                                </span>
                              </li>
                            ))}
                        </ul>
                      </details>
                    ))}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <p className="mt-5 text-[12px] text-neutral-600">
        Editing a plan changes what members see next session. It never changes a
        session already logged — those snapshot their own targets, so last
        week&rsquo;s numbers stay true. Assign from{" "}
        <Link href="/trainer" className="underline">Today</Link>.
      </p>
    </>
  );
}
