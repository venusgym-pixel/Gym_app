import Link from "next/link";
import { createServerDb, requireActor } from "@/lib/db/server";
import { AdminShell, Card, EmptyState, PageHeader, StatTile } from "@/components/admin/shell";
import { DaysLeft, StatusChip } from "@/components/ui/status-chip";
import { formatDate } from "@/lib/money";
import type { GymRole, MembershipStatus } from "@/lib/db/database.types";

/* ============================================================================
   T-01 · Trainer today.

   Honest about its limits. Sessions, workout plans and client assignment all
   need Phase 2 tables (trainer_clients, pt_sessions, workout_plans) that do
   not exist yet, so there is no schedule to show.

   What a trainer CAN see today is who trains here and who has stopped coming
   — which is the part of their job the current data supports. The permission
   matrix gives trainers scope 'assigned' on members, so RLS returns nothing
   from the gym-wide policy until assignment exists; the empty state says so
   rather than looking broken.
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

  const [{ data: gym }, { data: members }, { data: recent }] = await Promise.all([
    db.from("gyms").select("name").eq("id", actor.gymId).single(),
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
  ]);

  const rows = (members ?? []) as Row[];
  const visits = (recent ?? []) as unknown as {
    id: string;
    checked_in_at: string;
    members: { full_name: string } | null;
  }[];

  const active = rows.filter((r) => r.status === "active" || r.status === "expiring");

  return (
    <AdminShell
      role={actor.role as GymRole}
      email={actor.email}
      gymName={(gym as { name: string } | null)?.name ?? "Your gym"}
      current="/trainer"
    >
      <PageHeader
        eyebrow="Trainer"
        title="Today"
        sub="Sessions and workout plans arrive with the next release."
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {/* Clients, not "active memberships": the roster is the trainer's
            world, and a lapsed client is still theirs to chase. */}
        <StatTile value={rows.length} label="Your clients"
                  hint={active.length < rows.length
                    ? `${rows.length - active.length} not currently active`
                    : "all memberships live"} />
        <StatTile value={visits.length} label="Recent check-ins" />
        <StatTile value={0} label="Sessions today" hint="needs scheduling" />
        <StatTile value={0} label="Plans assigned" hint="needs a plans screen" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Members">
          {rows.length === 0 ? (
            <EmptyState>
              No clients assigned to you yet. Assignment arrives with the
              trainer&ndash;client schema.
            </EmptyState>
          ) : (
            <ul className="divide-y divide-neutral-300">
              {rows.map((r) => (
                <li key={r.id} className="flex items-center gap-3 py-2.5 text-[13.5px]">
                  <Link href={`/trainer/clients/${r.id}`}
                        className="min-w-0 flex-1 truncate font-medium hover:underline">
                    {r.full_name}
                  </Link>
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
    </AdminShell>
  );
}
