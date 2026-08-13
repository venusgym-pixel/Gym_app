import { redirect } from "next/navigation";
import { createServerDb, currentActor } from "@/lib/db/server";
import { AdminShell } from "@/components/admin/shell";
import type { GymRole } from "@/lib/db/database.types";

/* ============================================================================
   The admin shell, rendered once for every /admin route.

   It used to be rendered by each page, which cost a gym-name query on every
   single navigation and meant a loading.tsx would have blanked the sidebar
   along with the content. A layout stays mounted across route changes, so
   the nav no longer re-renders and only the content well swaps.
   ========================================================================= */

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const actor = await currentActor();
  /* The proxy already gates this, so reaching here without a session means
     it expired mid-visit. Send them to sign in rather than throwing. */
  if (!actor) redirect("/login?next=/admin");

  const db = await createServerDb();
  const { data: gym } = await db
    .from("gyms").select("name").eq("id", actor.gymId).single();

  return (
    <AdminShell
      role={actor.role as GymRole}
      email={actor.email}
      gymName={(gym as { name: string } | null)?.name ?? "Your gym"}
    >
      {children}
    </AdminShell>
  );
}
