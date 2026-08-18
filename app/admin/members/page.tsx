import Link from "next/link";
import { Suspense } from "react";
import { createServerDb, requireActor } from "@/lib/db/server";
import { Card, EmptyState, PageHeader } from "@/components/admin/shell";
import { DaysLeft, StatusChip } from "@/components/ui/status-chip";
import { formatDate } from "@/lib/money";
import type { MembershipStatus } from "@/lib/db/database.types";

/* ============================================================================
   A-02 · Members list.

   The screen reception lives in. Optimised for finding one person fast and
   seeing, without clicking, whether to let them train: name, status, and how
   long they have left.

   Filtering and searching happen in the database (members_list), not here —
   so the URL is shareable ("here are the four expiring, call them"), and so
   days_left is computed against the gym's date rather than the web server's.

   The header, the filter chips and the search box render immediately and the
   TABLE alone streams in behind a Suspense boundary. This is the one admin
   screen people interact with rather than read, and every chip and every
   search is a fresh navigation — with the route-level skeleton the whole
   page blanked each time, search box included, so it felt far slower than
   the query is (members_list executes in under a millisecond).
   ========================================================================= */

export const dynamic = "force-dynamic";

const FILTERS = [
  { key: "all",      label: "All" },
  { key: "active",   label: "Active" },
  { key: "expiring", label: "Expiring" },
  { key: "expired",  label: "Lapsed" },
] as const;

type FilterKey = (typeof FILTERS)[number]["key"];

interface Row {
  id: string;
  member_code: string;
  full_name: string;
  phone: string;
  joined_on: string;
  is_active: boolean;
  plan_name: string | null;
  status: MembershipStatus | null;
  expires_on: string | null;
  days_left: number | null;
}

export default async function MembersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string }>;
}) {
  const params = await searchParams;
  const filter = (FILTERS.find((f) => f.key === params.status)?.key ?? "all") as FilterKey;
  const q = (params.q ?? "").trim();

  return (
    <>
      <PageHeader
        eyebrow="Members"
        title="Members"
        sub={q ? `Matching “${q}”` : "Everyone on the books."}
        actions={
          <Link
            href="/admin/members/new"
            className="rounded-pill bg-neutral-900 px-4 py-2 text-[13px] font-semibold text-neutral-100"
          >
            Add member
          </Link>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <nav className="flex gap-1 rounded-pill bg-surface p-1">
          {FILTERS.map((f) => (
            <Link
              key={f.key}
              href={f.key === "all" ? "/admin/members" : `/admin/members?status=${f.key}`}
              className={`rounded-pill px-3.5 py-1.5 text-[12.5px] font-semibold transition-colors ${
                filter === f.key
                  ? "bg-neutral-900 text-neutral-100"
                  : "text-neutral-700 hover:bg-neutral-200"
              }`}
            >
              {f.label}
            </Link>
          ))}
        </nav>

        <form action="/admin/members" className="flex gap-2">
          <input
            name="q"
            defaultValue={q}
            placeholder="Name, phone or ID"
            aria-label="Search members"
            className="w-56 rounded-pill border border-neutral-300 bg-surface px-4 py-1.5 text-[13px] outline-none focus-visible:border-accent-500"
          />
          {filter !== "all" && <input type="hidden" name="status" value={filter} />}
        </form>
      </div>

      {/* Keyed on the query, so changing a filter shows the skeleton again
          rather than leaving the previous list sitting there looking current. */}
      <Suspense key={`${filter}:${q}`} fallback={<TableSkeleton />}>
        <MembersTable filter={filter} q={q} />
      </Suspense>

      <p className="mt-4 text-[12px] text-neutral-600">
        Tap a row to open a member, take a payment or assign a trainer.
      </p>
    </>
  );
}

async function MembersTable({ filter, q }: { filter: FilterKey; q: string }) {
  const actor = await requireActor();
  const db = await createServerDb();

  const { data, error } = await db.rpc("members_list", {
    p_gym_id: actor.gymId,
    p_status: filter === "all" ? null : filter,
    p_search: q || null,
  });

  const rows = (data ?? []) as Row[];

  if (error) {
    return (
      <Card className="p-0">
        <EmptyState>Could not load members. Refresh to try again.</EmptyState>
      </Card>
    );
  }

  if (rows.length === 0) {
    return (
      <Card className="p-0">
        <EmptyState>
          {q ? `Nobody matches “${q}”.`
             : filter === "all" ? "No members yet — add the first one."
             : `No ${filter} memberships right now.`}
        </EmptyState>
      </Card>
    );
  }

  return (
    <Card className="p-0">
      <div className="overflow-x-auto">
        <table className="w-full text-[13.5px]">
          <thead>
            <tr className="border-b border-neutral-300 text-left">
              {["Member", "Plan", "Status", "Expires", "Left", "Joined"].map((h) => (
                <th key={h}
                    className="px-4 py-2.5 font-mono text-[10.5px] font-normal tracking-[0.08em] text-neutral-600 uppercase">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => (
              <tr key={m.id}
                  className="border-b border-neutral-200 last:border-0 hover:bg-neutral-200/40">
                <td className="px-4 py-3">
                  <Link href={`/admin/members/${m.id}`} className="font-medium hover:underline">
                    {m.full_name}
                  </Link>
                  <div className="font-mono text-[11px] text-neutral-600">
                    {m.member_code} · {m.phone}
                  </div>
                </td>
                <td className="px-4 py-3 text-neutral-700">{m.plan_name ?? "—"}</td>
                <td className="px-4 py-3">
                  {m.status
                    ? <StatusChip status={m.status} />
                    : <span className="text-[12px] text-neutral-600">No membership</span>}
                </td>
                <td className="px-4 py-3 tabular text-neutral-700">
                  {m.expires_on ? formatDate(m.expires_on) : "—"}
                </td>
                <td className="px-4 py-3">
                  {m.days_left !== null ? <DaysLeft days={m.days_left} /> : "—"}
                </td>
                <td className="px-4 py-3 tabular text-neutral-600">
                  {formatDate(m.joined_on)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

/* Six rows of the right height, so the table does not jump when it lands. */
function TableSkeleton() {
  return (
    <Card className="p-0">
      <div className="px-4 py-2.5">
        <div className="h-3 w-40 animate-pulse rounded-sm bg-neutral-200" />
      </div>
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="flex items-center gap-4 border-t border-neutral-200 px-4 py-3">
          <div className="flex-1 space-y-1.5">
            <div className="h-3.5 w-36 animate-pulse rounded-sm bg-neutral-200" />
            <div className="h-2.5 w-28 animate-pulse rounded-sm bg-neutral-200" />
          </div>
          <div className="h-5 w-16 animate-pulse rounded-pill bg-neutral-200" />
          <div className="hidden h-3 w-20 animate-pulse rounded-sm bg-neutral-200 sm:block" />
        </div>
      ))}
    </Card>
  );
}
