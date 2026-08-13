import { createServerDb, requireActor } from "@/lib/db/server";
import { WorkoutLogger } from "./logger";

/* M-12/13/14/16 · Today's workout. The whole session is one client component;
   this only fetches what to show. */

export const dynamic = "force-dynamic";

export default async function WorkoutPage() {
  const actor = await requireActor();
  const db = await createServerDb();

  const { data: member } = await db
    .from("members")
    .select("id")
    .eq("gym_id", actor.gymId)
    .eq("user_id", actor.userId)
    .maybeSingle();

  const memberId = (member as { id: string } | null)?.id;
  if (!memberId) return <WorkoutLogger today={{ assigned: false }} />;

  const { data } = await db.rpc("todays_workout", {
    p_gym_id: actor.gymId,
    p_member_id: memberId,
  });

  return <WorkoutLogger today={(data ?? { assigned: false }) as never} />;
}
