import Link from "next/link";
import { createServerDb, requireActor } from "@/lib/db/server";
import { AdminShell, Card, PageHeader } from "@/components/admin/shell";
import { NewMemberForm } from "./form";
import type { GymRole } from "@/lib/db/database.types";

export const dynamic = "force-dynamic";

export default async function NewMemberPage() {
  const actor = await requireActor();
  const db = await createServerDb();
  const { data: gym } = await db.from("gyms").select("name").eq("id", actor.gymId).single();

  return (
    <AdminShell role={actor.role as GymRole} email={actor.email}
                gymName={(gym as { name: string } | null)?.name ?? "Your gym"}
                current="/admin/members">
      <PageHeader
        eyebrow="Members"
        title="Add a member"
        sub="Name and phone are enough to get started. Plan and payment come next."
        actions={
          <Link href="/admin/members"
                className="rounded-pill border border-neutral-300 px-4 py-2 text-[13px] font-semibold hover:bg-neutral-200">
            Cancel
          </Link>
        }
      />
      <Card><NewMemberForm /></Card>
    </AdminShell>
  );
}
