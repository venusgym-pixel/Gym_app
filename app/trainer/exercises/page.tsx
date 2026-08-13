import Link from "next/link";
import { createServerDb, requireActor } from "@/lib/db/server";
import { Card, EmptyState, PageHeader } from "@/components/admin/shell";

/* ============================================================================
   T-05 · Exercise library.

   Filtering is done with links and searchParams rather than client state, so
   a trainer can bookmark "chest, dumbbell only" and the back button behaves.
   The library is small enough (30 seeded, plus whatever the gym adds) that
   sending it all and grouping server-side beats a search endpoint.
   ========================================================================= */

export const dynamic = "force-dynamic";

interface Exercise {
  id: string;
  name: string;
  primary_muscle: string;
  secondary_muscles: string[];
  equipment: string;
  difficulty: string;
  instructions: string | null;
  common_mistakes: string | null;
  is_custom: boolean;
}

export default async function ExercisesPage({
  searchParams,
}: {
  searchParams: Promise<{ muscle?: string; equipment?: string }>;
}) {
  const actor = await requireActor();
  const db = await createServerDb();
  const { muscle, equipment } = await searchParams;

  const [{ data: exercises }] = await Promise.all([
    db
      .from("exercises")
      .select("*")
      .eq("gym_id", actor.gymId)
      .eq("is_active", true)
      .order("primary_muscle")
      .order("name"),
  ]);

  const all = (exercises ?? []) as Exercise[];
  const muscles = [...new Set(all.map((e) => e.primary_muscle))].sort();
  const kit = [...new Set(all.map((e) => e.equipment))].sort();

  const shown = all.filter(
    (e) =>
      (!muscle || e.primary_muscle === muscle) &&
      (!equipment || e.equipment === equipment),
  );

  const q = (next: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const merged = { muscle, equipment, ...next };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    const s = p.toString();
    return `/trainer/exercises${s ? `?${s}` : ""}`;
  };

  return (
    <>
      <PageHeader
        eyebrow="Coaching"
        title="Exercises"
        sub={`${shown.length} of ${all.length} · the movements your plans are built from`}
      />

      <div className="mb-5 space-y-2">
        <FilterRow label="Muscle" active={muscle} options={muscles}
                   href={(v) => q({ muscle: v })} clearHref={q({ muscle: undefined })} />
        <FilterRow label="Equipment" active={equipment} options={kit}
                   href={(v) => q({ equipment: v })} clearHref={q({ equipment: undefined })} />
      </div>

      {shown.length === 0 ? (
        <Card>
          <EmptyState>
            {all.length === 0
              ? "No exercises yet. Run seed_gym_exercises() to load the starter library of 30."
              : "Nothing matches those filters."}
          </EmptyState>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {shown.map((e) => (
            <Card key={e.id}>
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-[16px] leading-tight">{e.name}</h3>
                {e.is_custom && (
                  <span className="shrink-0 rounded-sm bg-neutral-200 px-1.5 py-px font-mono text-[9px] tracking-wider text-neutral-700 uppercase">
                    yours
                  </span>
                )}
              </div>

              <div className="mt-2 flex flex-wrap gap-1.5">
                <Tag>{e.primary_muscle}</Tag>
                <Tag muted>{e.equipment}</Tag>
                <Tag muted>{e.difficulty}</Tag>
              </div>

              {e.secondary_muscles.length > 0 && (
                <p className="mt-2 text-[11.5px] text-neutral-600">
                  also works {e.secondary_muscles.join(", ")}
                </p>
              )}

              {e.instructions && (
                <p className="mt-2.5 text-[12.5px] text-neutral-700">{e.instructions}</p>
              )}

              {e.common_mistakes && (
                <p className="mt-2 rounded-sm bg-accent-100 px-2.5 py-1.5 text-[11.5px] text-accent-800">
                  Watch for: {e.common_mistakes}
                </p>
              )}
            </Card>
          ))}
        </div>
      )}
    </>
  );
}

function FilterRow({
  label, active, options, href, clearHref,
}: {
  label: string;
  active?: string;
  options: string[];
  href: (v: string) => string;
  clearHref: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="mr-1 w-[72px] shrink-0 font-mono text-[10.5px] tracking-wider text-neutral-600 uppercase">
        {label}
      </span>
      <Link
        href={clearHref}
        className={`rounded-pill px-3 py-1 text-[12px] ${
          !active ? "bg-neutral-900 font-semibold text-neutral-100" : "bg-neutral-200 text-neutral-700"
        }`}
      >
        All
      </Link>
      {options.map((o) => (
        <Link
          key={o}
          href={href(o)}
          className={`rounded-pill px-3 py-1 text-[12px] capitalize ${
            active === o
              ? "bg-neutral-900 font-semibold text-neutral-100"
              : "bg-neutral-200 text-neutral-700 hover:bg-neutral-300"
          }`}
        >
          {o}
        </Link>
      ))}
    </div>
  );
}

function Tag({ children, muted }: { children: React.ReactNode; muted?: boolean }) {
  return (
    <span
      className={`rounded-pill px-2 py-0.5 text-[10.5px] font-semibold capitalize ${
        muted ? "bg-neutral-200 text-neutral-700" : "bg-sage-200 text-sage-800"
      }`}
    >
      {children}
    </span>
  );
}
