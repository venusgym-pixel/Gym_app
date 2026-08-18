import Link from "next/link";
import { requireActor } from "@/lib/db/server";
import { can } from "@/lib/auth/permissions";
import type { GymRole } from "@/lib/db/database.types";
import { Card, PageHeader } from "@/components/admin/shell";
import { NewPlanForm } from "./form";

export const dynamic = "force-dynamic";

export default async function NewPlanPage() {
  const actor = await requireActor();

  if (!can(actor.role as GymRole, "workouts", "create")) {
    return (
      <>
        <PageHeader eyebrow="Coaching" title="New workout plan" />
        <Card>
          <p className="text-[13px] text-neutral-600">
            Your role can view plans but not create them.{" "}
            <Link href="/trainer/plans" className="underline">Back to plans</Link>
          </p>
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="Coaching"
        title="New workout plan"
        sub="Name it and pick the split — days and exercises come next, in the editor."
      />
      <Card className="max-w-xl">
        <NewPlanForm />
      </Card>
    </>
  );
}
