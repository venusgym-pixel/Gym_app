import { createServerDb, requireActor } from "@/lib/db/server";
import { AdminShell, Card, EmptyState, PageHeader } from "@/components/admin/shell";
import { formatINR, gstSplit } from "@/lib/money";
import type { GymRole } from "@/lib/db/database.types";

/* ============================================================================
   A-13 · Membership plans.

   Read-only for now, deliberately. Existing memberships store their own
   price_paise, so editing a plan is not retroactive — which is correct, but
   it means "change the price" is a decision with consequences (does the
   renewal quote change mid-conversation?) that deserves its own screen rather
   than an inline field someone edits by accident.
   ========================================================================= */

export const dynamic = "force-dynamic";

interface Plan {
  id: string;
  name: string;
  duration_days: number;
  price_paise: string;
  freeze_days_allowed: number;
  is_visible_to_members: boolean;
}

export default async function PlansPage() {
  const actor = await requireActor();
  const db = await createServerDb();

  const [{ data: gym }, { data: plans }, { data: counts }] = await Promise.all([
    db.from("gyms").select("name").eq("id", actor.gymId).single(),
    db.from("plans").select("*").eq("gym_id", actor.gymId).order("sort_order"),
    db.from("memberships").select("plan_id, status").eq("gym_id", actor.gymId),
  ]);

  const live = new Map<string, number>();
  for (const r of (counts ?? []) as { plan_id: string; status: string }[]) {
    if (r.status === "active" || r.status === "expiring") {
      live.set(r.plan_id, (live.get(r.plan_id) ?? 0) + 1);
    }
  }

  return (
    <AdminShell
      role={actor.role as GymRole}
      email={actor.email}
      gymName={(gym as { name: string } | null)?.name ?? "Your gym"}
      current="/admin/plans"
    >
      <PageHeader
        eyebrow="Memberships"
        title="Plans"
        sub="Prices exclude GST; 18% is added at checkout."
      />

      {(plans ?? []).length === 0 ? (
        <Card>
          <EmptyState>No plans yet.</EmptyState>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-3">
          {((plans ?? []) as Plan[]).map((p) => {
            const split = gstSplit(Number(p.price_paise));
            const perMonth = Math.round(
              Number(p.price_paise) / (p.duration_days / 30),
            );
            return (
              <Card key={p.id}>
                <div className="flex items-baseline justify-between">
                  <h3 className="text-[20px]">{p.name}</h3>
                  <span className="tabular text-[20px] font-bold text-accent-700">
                    {formatINR(p.price_paise)}
                  </span>
                </div>

                <dl className="mt-3 space-y-1 text-[12.5px] text-neutral-700">
                  <Line label="Duration" value={`${p.duration_days} days`} />
                  <Line label="With GST" value={formatINR(split.totalPaise)} />
                  <Line label="Effective / month" value={formatINR(perMonth)} />
                  <Line label="Freeze allowance" value={`${p.freeze_days_allowed} days`} />
                  <Line
                    label="On this plan now"
                    value={String(live.get(p.id) ?? 0)}
                    strong
                  />
                </dl>

                {!p.is_visible_to_members && (
                  <p className="mt-3 rounded-sm bg-neutral-200 px-2 py-1 text-[11px] text-neutral-700">
                    Hidden from the member app — staff can still assign it.
                  </p>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </AdminShell>
  );
}

function Line({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex justify-between">
      <dt>{label}</dt>
      <dd className={`tabular ${strong ? "font-semibold text-ink" : ""}`}>{value}</dd>
    </div>
  );
}
