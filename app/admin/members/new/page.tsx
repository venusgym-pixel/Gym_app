import Link from "next/link";
import { requireActor } from "@/lib/db/server";
import { Card, PageHeader } from "@/components/admin/shell";
import { NewMemberForm } from "./form";

export const dynamic = "force-dynamic";

export default async function NewMemberPage() {
  await requireActor();

  return (
    <>
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
    </>
  );
}
