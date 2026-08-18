import { createServerDb, requireActor } from "@/lib/db/server";
import { can } from "@/lib/auth/permissions";
import type { Equipment, GymRole } from "@/lib/db/database.types";
import { Card, EmptyState, PageHeader, StatTile } from "@/components/admin/shell";
import {
  EditDisclosure, EquipmentForm, RetireButton, SeedEquipmentButton, StatusButtons, StatusChip,
} from "./client";

/* ============================================================================
   A-xx · Equipment.

   The machines and kit the gym owns, and — the part that changes weekly —
   whether each is usable. Status flows through to coaching: an exercise
   linked to a machine that is down gets flagged in the plan builder, so a
   trainer never programmes the broken leg press.
   ========================================================================= */

export const dynamic = "force-dynamic";

const CATEGORY_ORDER: [Equipment["category"], string][] = [
  ["machine", "Machines"],
  ["cable", "Cable stations"],
  ["cardio", "Cardio"],
  ["free_weight", "Free weights"],
  ["bench_rack", "Benches & racks"],
  ["accessory", "Accessories"],
];

export default async function EquipmentPage() {
  const actor = await requireActor();
  const role = actor.role as GymRole;
  const db = await createServerDb();

  const [{ data: kit }, { data: linked }] = await Promise.all([
    db
      .from("equipment")
      .select("*")
      .eq("gym_id", actor.gymId)
      .eq("is_active", true)
      .order("name"),
    db
      .from("exercises")
      .select("equipment_id")
      .eq("gym_id", actor.gymId)
      .eq("is_active", true)
      .not("equipment_id", "is", null),
  ]);

  const rows = (kit ?? []) as Equipment[];
  const usedBy = new Map<string, number>();
  for (const e of (linked ?? []) as { equipment_id: string }[]) {
    usedBy.set(e.equipment_id, (usedBy.get(e.equipment_id) ?? 0) + 1);
  }

  const units = rows.reduce((t, r) => t + r.quantity, 0);
  const down = rows.filter((r) => r.status === "out_of_order").length;
  const maintenance = rows.filter((r) => r.status === "maintenance").length;

  const canCreate = can(role, "equipment", "create");
  const canEdit = can(role, "equipment", "edit");
  const canDelete = can(role, "equipment", "delete");

  return (
    <>
      <PageHeader
        eyebrow="Operations"
        title="Equipment"
        sub="What the floor has, and what is currently down. Trainers see this when they build plans."
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile value={rows.length} label="Kinds of kit" />
        <StatTile value={units} label="Units on the floor" />
        <StatTile value={maintenance} label="Under maintenance"
                  tone={maintenance > 0 ? "warn" : "plain"} />
        <StatTile value={down} label="Out of order"
                  tone={down > 0 ? "warn" : "plain"} />
      </div>

      {canCreate && (
        <Card className="mb-5">
          <details>
            <summary className="cursor-pointer list-none text-[13.5px] font-semibold">
              + Add equipment
            </summary>
            <div className="mt-4">
              <EquipmentForm />
            </div>
          </details>
        </Card>
      )}

      {rows.length === 0 ? (
        <Card>
          <EmptyState>
            Nothing registered yet. Load the starter list and edit it to match
            your floor, or add machines one by one above.
          </EmptyState>
          {canCreate && (
            <div className="flex justify-center pb-4">
              <SeedEquipmentButton />
            </div>
          )}
        </Card>
      ) : (
        <div className="space-y-4">
          {CATEGORY_ORDER.map(([cat, label]) => {
            const group = rows.filter((r) => r.category === cat);
            if (group.length === 0) return null;
            return (
              <Card key={cat} title={label}>
                <ul className="divide-y divide-neutral-200">
                  {group.map((r) => (
                    <li key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
                      <div className="min-w-0 flex-1 basis-52">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-[14.5px] font-medium">{r.name}</span>
                          {r.quantity > 1 && (
                            <span className="shrink-0 font-mono text-[10.5px] text-neutral-600">
                              ×{r.quantity}
                            </span>
                          )}
                          {!canEdit && <StatusChip status={r.status} />}
                        </div>
                        <div className="mt-0.5 text-[11.5px] text-neutral-600">
                          {[r.brand, r.model].filter(Boolean).join(" · ") || "—"}
                          {usedBy.has(r.id) && (
                            <> · used by {usedBy.get(r.id)} exercise{usedBy.get(r.id) === 1 ? "" : "s"}</>
                          )}
                        </div>
                        {r.notes && (
                          <div className="mt-0.5 text-[11.5px] text-neutral-600">{r.notes}</div>
                        )}
                      </div>

                      {canEdit && <StatusButtons id={r.id} status={r.status} />}

                      <div className="flex shrink-0 items-center gap-3">
                        {canEdit && <EditDisclosure initial={r} />}
                        {canDelete && <RetireButton id={r.id} name={r.name} />}
                      </div>
                    </li>
                  ))}
                </ul>
              </Card>
            );
          })}

          {canCreate && (
            <details className="px-1">
              <summary className="cursor-pointer list-none text-[12px] text-neutral-600 underline">
                Missing common items? Load the starter list
              </summary>
              <div className="mt-3">
                <SeedEquipmentButton />
              </div>
            </details>
          )}
        </div>
      )}

      <p className="mt-5 text-[12px] text-neutral-600">
        Mark a machine <em>out of order</em> and every exercise linked to it is
        flagged in the plan builder, so nobody programmes it until it is fixed.
        Link exercises to machines from the trainer surface&rsquo;s exercise library.
      </p>
    </>
  );
}
