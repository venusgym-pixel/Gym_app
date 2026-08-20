import { createServerDb, requireActor } from "@/lib/db/server";
import { PageHeader } from "@/components/admin/shell";
import { PlansManager, type PlanWithCounts } from "./client";

/* ============================================================================
   A-13 / A-14 · Membership plans.

   These used to be read-only, on the reasoning that changing a price is a
   decision with consequences and deserved its own screen. It never got one,
   which left plans creatable only by the bootstrap script — so a gym could not
   raise a price, add a plan, or open a second branch without a developer.

   The consequence that reasoning was protecting against is real, and is now
   handled where it belongs: memberships store their own price, so an edit is
   never retroactive, and the editor says so in front of anyone changing a
   price on a plan people are currently on.
   ========================================================================= */

export const dynamic = "force-dynamic";

export default async function PlansPage() {
  const actor = await requireActor();
  const db = await createServerDb();

  const [{ data: plans }, { data: counts }] = await Promise.all([
    db.from("plans").select("*").eq("gym_id", actor.gymId).order("sort_order"),
    db.from("memberships").select("plan_id, status").eq("gym_id", actor.gymId),
  ]);

  /* Two different numbers, for two different decisions. `live` is who is on a
     plan right now, which is what makes a price change worth warning about.
     `sold` counts every membership ever written against it, including expired
     ones — that is what makes deletion impossible, because their invoices
     still point here. */
  const live = new Map<string, number>();
  const sold = new Map<string, number>();
  for (const r of (counts ?? []) as { plan_id: string; status: string }[]) {
    sold.set(r.plan_id, (sold.get(r.plan_id) ?? 0) + 1);
    if (r.status === "active" || r.status === "expiring") {
      live.set(r.plan_id, (live.get(r.plan_id) ?? 0) + 1);
    }
  }

  const rows: PlanWithCounts[] = ((plans ?? []) as PlanWithCounts[]).map((p) => ({
    ...p,
    liveCount: live.get(p.id) ?? 0,
    soldCount: sold.get(p.id) ?? 0,
  }));

  return (
    <>
      <PageHeader
        eyebrow="Memberships"
        title="Plans"
        sub="Prices exclude GST; 18% is added at checkout."
      />
      <PlansManager plans={rows} />
    </>
  );
}
