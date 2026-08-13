import { createServerDb, requireActor } from "@/lib/db/server";
import { AdminShell, Card, EmptyState, PageHeader, StatTile } from "@/components/admin/shell";
import { can } from "@/lib/auth/permissions";
import { formatINR } from "@/lib/money";
import { LeadCard, NewLeadForm } from "./client";
import type { GymRole } from "@/lib/db/database.types";

/* ============================================================================
   A-25 … A-29 · Enquiries.

   Organised by what has to happen today, not by pipeline stage. A kanban
   board looks like a CRM but answers the wrong question: the receptionist
   with ten minutes free needs "who am I calling", and overdue must be
   impossible to miss.
   ========================================================================= */

export const dynamic = "force-dynamic";

export interface Lead {
  id: string;
  full_name: string;
  phone: string;
  email: string | null;
  source: string | null;
  status: "new" | "contacted" | "trial_booked" | "trial_done" | "won" | "lost";
  interested_plan_id: string | null;
  quoted_paise: string | null;
  trial_on: string | null;
  next_follow_up_on: string | null;
  notes: string | null;
  lost_reason: string | null;
  converted_member_id: string | null;
  created_at: string;
  lead_activities: { id: string; kind: string; body: string; created_at: string }[];
}

export default async function LeadsPage() {
  const actor = await requireActor();
  const db = await createServerDb();
  const role = actor.role as GymRole;

  const [{ data: gym }, { data: leads }, { data: plans }] = await Promise.all([
    db.from("gyms").select("name").eq("id", actor.gymId).single(),
    db
      .from("leads")
      .select("*, lead_activities(id, kind, body, created_at)")
      .eq("gym_id", actor.gymId)
      .order("created_at", { ascending: false })
      .limit(200),
    db
      .from("plans")
      .select("id, name, price_paise")
      .eq("gym_id", actor.gymId)
      .order("sort_order"),
  ]);

  const rows = (leads ?? []) as unknown as Lead[];
  const planRows = (plans ?? []) as { id: string; name: string; price_paise: string }[];
  const planName = new Map(planRows.map((p) => [p.id, p.name]));

  /* Today is computed once, server-side, in the gym's own day. Doing it per
     row in the browser reintroduced the UTC off-by-one that made a Monday
     follow-up show as overdue on Sunday night. */
  const today = new Date().toISOString().slice(0, 10);

  const open = rows.filter((l) => l.status !== "won" && l.status !== "lost");
  const overdue = open.filter((l) => l.next_follow_up_on && l.next_follow_up_on < today);
  const dueToday = open.filter((l) => l.next_follow_up_on === today);
  const later = open.filter(
    (l) => !l.next_follow_up_on || l.next_follow_up_on > today,
  );
  const closed = rows.filter((l) => l.status === "won" || l.status === "lost");
  const won = closed.filter((l) => l.status === "won");

  const conversion =
    rows.length > 0 ? Math.round((won.length / rows.length) * 100) : null;

  /* Which sources actually produce members — the only marketing number a
     small gym can act on. */
  const bySource = new Map<string, { total: number; won: number }>();
  for (const l of rows) {
    const key = l.source?.trim() || "Not recorded";
    const e = bySource.get(key) ?? { total: 0, won: 0 };
    e.total++;
    if (l.status === "won") e.won++;
    bySource.set(key, e);
  }

  const mayEdit = can(role, "leads", "edit");

  const cardProps = { plans: planRows, planName, canEdit: mayEdit, today };

  return (
    <AdminShell role={role} email={actor.email}
                gymName={(gym as { name: string } | null)?.name ?? "Your gym"}
                current="/admin/leads">
      <PageHeader
        eyebrow="Enquiries"
        title="Who to call"
        sub="Every walk-in and phone enquiry, with the date you promised to ring back."
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile value={overdue.length} label="Overdue"
                  tone={overdue.length ? "warn" : "plain"}
                  hint={overdue.length ? "call these first" : "nothing slipping"} />
        <StatTile value={dueToday.length} label="Due today" />
        <StatTile value={open.length} label="Open enquiries" />
        <StatTile value={conversion === null ? "—" : `${conversion}%`} label="Became members"
                  hint={`${won.length} of ${rows.length}`} tone={won.length ? "good" : "plain"} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        <div className="space-y-4">
          {overdue.length > 0 && (
            <Card title={`Overdue · ${overdue.length}`}>
              <div className="space-y-3">
                {overdue.map((l) => <LeadCard key={l.id} lead={l} {...cardProps} overdue />)}
              </div>
            </Card>
          )}

          <Card title={`Due today · ${dueToday.length}`}>
            {dueToday.length === 0 ? (
              <EmptyState>Nothing to chase today.</EmptyState>
            ) : (
              <div className="space-y-3">
                {dueToday.map((l) => <LeadCard key={l.id} lead={l} {...cardProps} />)}
              </div>
            )}
          </Card>

          <Card title={`Later · ${later.length}`}>
            {later.length === 0 ? (
              <EmptyState>Nothing scheduled further out.</EmptyState>
            ) : (
              <div className="space-y-3">
                {later.map((l) => <LeadCard key={l.id} lead={l} {...cardProps} />)}
              </div>
            )}
          </Card>

          {closed.length > 0 && (
            <Card title={`Closed · ${closed.length}`}>
              <ul className="divide-y divide-neutral-300">
                {closed.map((l) => (
                  <li key={l.id} className="flex items-center gap-3 py-2 text-[13px]">
                    <span className="min-w-0 flex-1 truncate">{l.full_name}</span>
                    {l.source && (
                      <span className="hidden truncate text-[11.5px] text-neutral-600 sm:block">
                        {l.source}
                      </span>
                    )}
                    <span
                      className={`rounded-pill px-2.5 py-0.5 text-[11px] font-semibold ${
                        l.status === "won"
                          ? "bg-sage-200 text-sage-800"
                          : "bg-neutral-200 text-neutral-700"
                      }`}
                    >
                      {l.status === "won" ? "member" : "lost"}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>

        <div className="space-y-4">
          {can(role, "leads", "create") ? (
            <Card title="New enquiry">
              <NewLeadForm plans={planRows} />
            </Card>
          ) : (
            <Card title="New enquiry">
              <EmptyState>You do not have permission to add enquiries.</EmptyState>
            </Card>
          )}

          <Card title="Where they come from">
            {bySource.size === 0 ? (
              <EmptyState>No enquiries recorded yet.</EmptyState>
            ) : (
              <ul className="space-y-2">
                {[...bySource.entries()]
                  .sort((a, b) => b[1].total - a[1].total)
                  .map(([source, e]) => (
                    <li key={source} className="flex items-baseline justify-between gap-3 text-[12.5px]">
                      <span className="min-w-0 truncate">{source}</span>
                      <span className="tabular shrink-0 text-neutral-700">
                        {e.won}/{e.total}
                        <span className="ml-2 text-neutral-600">
                          {e.total > 0 ? `${Math.round((e.won / e.total) * 100)}%` : ""}
                        </span>
                      </span>
                    </li>
                  ))}
              </ul>
            )}
            <p className="mt-3 text-[11.5px] text-neutral-600">
              Converted / total. The source that produces members is worth
              more than the one that produces enquiries.
            </p>
          </Card>

          {planRows.length > 0 && (
            <Card title="What you are quoting">
              <ul className="space-y-1.5 text-[12.5px]">
                {planRows.map((p) => (
                  <li key={p.id} className="flex justify-between">
                    <span>{p.name}</span>
                    <span className="tabular font-semibold">{formatINR(p.price_paise)}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </AdminShell>
  );
}
