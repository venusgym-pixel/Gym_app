import { requireActor, createServerDb } from "@/lib/db/server";
import { redirect } from "next/navigation";
import { KioskDisplay } from "./display";

/* ============================================================================
   K-01 · The kiosk screen.

   Rendered full-bleed, outside the admin shell: this runs on a tablet left
   on the reception counter, and a sidebar full of links into the admin
   console is exactly what should not be reachable from an unattended device.

   Staff-only, because whoever can mint kiosk tokens can check in from home —
   which is the one thing the rotating token exists to prevent.
   ========================================================================= */

export const dynamic = "force-dynamic";

export default async function KioskPage() {
  const actor = await requireActor();
  if (!["owner", "manager", "receptionist"].includes(actor.role)) redirect("/admin");

  const db = await createServerDb();
  const { data: gym } = await db
    .from("gyms")
    .select("name")
    .eq("id", actor.gymId)
    .single();

  return <KioskDisplay gymName={(gym as { name: string } | null)?.name ?? "Fitwell"} />;
}
