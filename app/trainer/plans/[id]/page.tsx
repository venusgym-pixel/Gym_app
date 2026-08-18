import Link from "next/link";
import { notFound } from "next/navigation";
import { createServerDb, requireActor } from "@/lib/db/server";
import { can } from "@/lib/auth/permissions";
import type { GymRole } from "@/lib/db/database.types";
import { Card, PageHeader } from "@/components/admin/shell";
import {
  AddDayButton, ArchivePlan, DayEditor, PlanMetaForm,
  type EditorDay, type LibraryOption,
} from "./editor";

/* ============================================================================
   T-10 · Workout plan builder.

   One page per plan. The server render is the single source of truth for
   structure; every mutation in editor.tsx revalidates this route. Machines
   that are down surface here, on the exercise rows and in the add dropdown,
   because the moment to learn the leg press is broken is while programming
   it, not on the gym floor.
   ========================================================================= */

export const dynamic = "force-dynamic";

interface ItemRow {
  id: string;
  position: number;
  sets: number;
  target_reps: number;
  target_weight_kg: number | null;
  rest_seconds: number;
  notes: string | null;
  exercises: {
    name: string;
    primary_muscle: string;
    equipment: string;
    equipment_id: string | null;
  } | null;
}

interface DayRow {
  id: string;
  day_index: number;
  name: string;
  workout_exercises: ItemRow[];
}

export default async function PlanEditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const actor = await requireActor();
  const role = actor.role as GymRole;
  const db = await createServerDb();

  const [{ data: plan }, { data: library }, { data: machines }, { count: liveCount }] =
    await Promise.all([
      db
        .from("workout_plans")
        .select(
          "id, name, goal, days_per_week, is_template, is_active, " +
            "workout_days(id, day_index, name, " +
            "workout_exercises(id, position, sets, target_reps, target_weight_kg, rest_seconds, notes, " +
            "exercises(name, primary_muscle, equipment, equipment_id)))",
        )
        .eq("gym_id", actor.gymId)
        .eq("id", id)
        .maybeSingle(),
      db
        .from("exercises")
        .select("id, name, primary_muscle, equipment, equipment_id")
        .eq("gym_id", actor.gymId)
        .eq("is_active", true)
        .order("primary_muscle")
        .order("name"),
      db
        .from("equipment")
        .select("id, status")
        .eq("gym_id", actor.gymId)
        .eq("is_active", true),
      db
        .from("workout_assignments")
        .select("id", { count: "exact", head: true })
        .eq("gym_id", actor.gymId)
        .eq("plan_id", id)
        .is("ends_on", null),
    ]);

  if (!plan) notFound();

  const p = plan as unknown as {
    id: string; name: string; goal: string | null; days_per_week: number;
    is_template: boolean; is_active: boolean; workout_days: DayRow[];
  };

  const downMachines = new Set(
    ((machines ?? []) as { id: string; status: string }[])
      .filter((m) => m.status !== "working")
      .map((m) => m.id),
  );

  const days: EditorDay[] = [...p.workout_days]
    .sort((a, b) => a.day_index - b.day_index)
    .map((d) => ({
      id: d.id,
      day_index: d.day_index,
      name: d.name,
      items: [...d.workout_exercises]
        .sort((a, b) => a.position - b.position)
        .map((x) => ({
          id: x.id,
          position: x.position,
          sets: x.sets,
          target_reps: x.target_reps,
          target_weight_kg: x.target_weight_kg,
          rest_seconds: x.rest_seconds,
          notes: x.notes,
          name: x.exercises?.name ?? "Removed exercise",
          muscle: x.exercises?.primary_muscle ?? "",
          equipment: x.exercises?.equipment ?? "",
          machineDown:
            !!x.exercises?.equipment_id && downMachines.has(x.exercises.equipment_id),
        })),
    }));

  const options: LibraryOption[] = (
    (library ?? []) as {
      id: string; name: string; primary_muscle: string;
      equipment: string; equipment_id: string | null;
    }[]
  ).map((e) => ({
    id: e.id,
    name: e.name,
    muscle: e.primary_muscle,
    equipment: e.equipment,
    down: !!e.equipment_id && downMachines.has(e.equipment_id),
  }));

  const mayEdit = can(role, "workouts", "edit");
  const mayDelete = can(role, "workouts", "delete");
  const live = liveCount ?? 0;

  return (
    <>
      <PageHeader
        eyebrow="Coaching · plan builder"
        title={p.name}
        sub={
          `${days.length} day${days.length === 1 ? "" : "s"} · ` +
          (live > 0
            ? `${live} member${live === 1 ? "" : "s"} training on it — edits show on their phones next session`
            : "nobody assigned yet — assign from a client's page") +
          (p.is_active ? "" : " · ARCHIVED")
        }
        actions={
          <Link href="/trainer/plans"
                className="rounded-pill bg-neutral-200 px-4 py-2 text-[13px] font-semibold text-neutral-800 hover:bg-neutral-300">
            ← All plans
          </Link>
        }
      />

      {!mayEdit ? (
        <Card>
          <p className="text-[13px] text-neutral-600">
            Your role can view this plan but not edit it. The full split is on{" "}
            <Link href="/trainer/plans" className="underline">the plans page</Link>.
          </p>
        </Card>
      ) : (
        <div className="space-y-4">
          <Card title="Plan details">
            <PlanMetaForm plan={p} />
          </Card>

          {days.map((d) => (
            <DayEditor key={d.id} day={d} planId={p.id}
                       options={options} canDelete={mayDelete} />
          ))}

          <div className="flex items-center justify-between gap-4">
            <AddDayButton planId={p.id} dayCount={days.length} />
            {mayDelete && p.is_active && <ArchivePlan planId={p.id} />}
          </div>

          <p className="text-[12px] text-neutral-600">
            Members rotate through days in order, one per visit. Editing here
            changes their next session, never a session already logged.
          </p>
        </div>
      )}
    </>
  );
}
