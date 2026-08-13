import Link from "next/link";
import { createServerDb, requireActor } from "@/lib/db/server";
import { Card, EmptyState, PageHeader } from "@/components/admin/shell";
import { DaysLeft, StatusChip } from "@/components/ui/status-chip";
import { formatDate } from "@/lib/money";
import type {
  MembershipStatus } from "@/lib/db/database.types";

/* ============================================================================
   A-02 · Members list.

   The screen reception lives in. Optimised for finding one person fast and
   seeing, without clicking, whether to let them train: name, status, and how
   long they have left.

   Filtering and searching happen in the database (members_list), not here —
   so the URL is shareable ("here are the four expiring, call them"), and so
   days_left is computed against the gym's date rather than the web server's.
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
  const actor = await requireActor();
  const params = await searchParams;
  const filter = (FILTERS.find((f) => f.key === params.status)?.key ?? "all") as FilterKey;
  const q = (params.q ?? "").trim();

  const db = await createServerDb();

  const [{ data, error }] = await Promise.all([
    db.rpc("members_list", {
      p_gym_id: actor.gymId,
      p_status: filter === "all" ? null : filter,
      p_search: q || null,
    }),
  ]);

  const rows = (data ?? []) as Row[];

  return (
    <>
      <PageHeader
        eyebrow="Members"
        title={`${rows.length} ${rows.length === 1 ? "member" : "members"}`}
        sub={q ? `Matching "${q}"` : "Everyone on the books."}
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

      <Card className="p-0">
        {error ? (
          <EmptyState>Could not load members. Refresh to try again.</EmptyState>
        ) : rows.length === 0 ? (
          <EmptyState>
            {q ? `Nobody matches "${q}".`
               : filter === "all" ? "No members yet — add the first one."
               : `No ${filter} memberships right now.`}
          </EmptyState>
        ) : (
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
                      <div className="font-medium">{m.full_name}</div>
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
        )}
      </Card>

      <p className="mt-4 text-[12px] text-neutral-600">
        Member profiles, adding members and taking payments are the next build.
      </p>
    </>
  );
}
