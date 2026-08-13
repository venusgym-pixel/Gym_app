import Link from "next/link";
import { createServerDb, requireActor } from "@/lib/db/server";
import { Card, EmptyState, PageHeader, StatTile } from "@/components/admin/shell";
import { DaysLeft, StatusChip } from "@/components/ui/status-chip";
import { formatDate } from "@/lib/money";
import type {
  MembershipStatus } from "@/lib/db/database.types";

/* ============================================================================
   T-01 · Trainer today.

   The roster, plus what has happened lately. Scheduled PT sessions are the
   one thing genuinely missing — pt_sessions does not exist — so there is no
   diary here and no tile pretending to be one.

   The permission matrix gives trainers scope 'assigned' on members, so RLS
   returns nothing from the gym-wide policy until a trainer_clients row
   exists; the empty state says so rather than looking broken.
   ========================================================================= */

export const dynamic = "force-dynamic";

interface Row {
  id: string;
  full_name: string;
  member_code: string;
  status: MembershipStatus | null;
  days_left: number | null;
  plan_name: string | null;
}

export default async function TrainerHome() {
  const actor = await requireActor();
  const db = await createServerDb();

  const [{ data: members }, { data: recent }, { data: assigned }] =
    await Promise.all([
      db.rpc("members_list", {
        p_gym_id: actor.gymId,
        p_status: null,
        p_search: null,
      }),
      db
        .from("attendance")
        .select("id, checked_in_at, members(full_name)")
        .eq("gym_id", actor.gymId)
        .order("checked_in_at", { ascending: false })
        .limit(10),
      /* RLS keeps this to the trainer's own clients, so the count is theirs
         and not the gym's. */
      db
        .from("workout_assignments")
        .select("member_id, workout_plans(name)")
        .eq("gym_id", actor.gymId)
        .is("ends_on", null),
    ]);

  const rows = (members ?? []) as Row[];
  const visits = (recent ?? []) as unknown as {
    id: string;
    checked_in_at: string;
    members: { full_name: string } | null;
  }[];

  const active = rows.filter((r) => r.status === "active" || r.status === "expiring");

  const plans = (assigned ?? []) as unknown as {
    member_id: string;
    workout_plans: { name: string } | null;
  }[];
  const onPlan = new Set(plans.map((a) => a.member_id));
  const withoutPlan = rows.filter((r) => !onPlan.has(r.id));

  return (
    <>
      <PageHeader
        eyebrow="Trainer"
        title="Today"
        sub="Your clients, and who has been in."
        actions={
          <Link
            href="/trainer/plans"
            className="rounded-pill border border-neutral-300 px-4 py-2 text-[13px] font-semibold text-neutral-800 hover:bg-neutral-200"
          >
            Workout plans
          </Link>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {/* Clients, not "active memberships": the roster is the trainer's
            world, and a lapsed client is still theirs to chase. */}
        <StatTile value={rows.length} label="Your clients"
                  hint={active.length < rows.length
                    ? `${rows.length - active.length} not currently active`
                    : "all memberships live"} />
        <StatTile value={visits.length} label="Recent check-ins" />
        <StatTile value={plans.length} label="On a workout plan" />
        <StatTile
          value={withoutPlan.length}
          label="Without a plan"
          tone={withoutPlan.length > 0 ? "warn" : "good"}
          hint={withoutPlan.length > 0 ? "nothing shows on their phone" : "everyone has one"}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Members">
          {rows.length === 0 ? (
            <EmptyState>
              No clients assigned to you yet. An owner or manager links members
              to you from the member&rsquo;s profile.
            </EmptyState>
          ) : (
            <ul className="divide-y divide-neutral-300">
              {rows.map((r) => (
                <li key={r.id} className="flex items-center gap-3 py-2.5 text-[13.5px]">
                  <Link href={`/trainer/clients/${r.id}`}
                        className="min-w-0 flex-1 truncate font-medium hover:underline">
                    {r.full_name}
                  </Link>
                  {!onPlan.has(r.id) && (
                    <span className="rounded-sm bg-accent-200 px-1.5 py-px font-mono text-[9px] tracking-wider text-accent-800 uppercase">
                      no plan
                    </span>
                  )}
                  {r.status && <StatusChip status={r.status} />}
                  {r.days_left !== null && <DaysLeft days={r.days_left} />}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Recent check-ins">
          {visits.length === 0 ? (
            <EmptyState>Nobody has checked in recently.</EmptyState>
          ) : (
            <ul className="divide-y divide-neutral-300">
              {visits.map((v) => (
                <li key={v.id} className="flex justify-between py-2.5 text-[13.5px]">
                  <span>{v.members?.full_name}</span>
                  <span className="text-neutral-600">
                    {formatDate(v.checked_in_at)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
