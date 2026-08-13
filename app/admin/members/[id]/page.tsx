import Link from "next/link";
import { notFound } from "next/navigation";
import { createServerDb, requireActor } from "@/lib/db/server";
import { AdminShell, Card, EmptyState, PageHeader, StatTile } from "@/components/admin/shell";
import { StatusChip } from "@/components/ui/status-chip";
import { formatDate, formatINR } from "@/lib/money";
import { CheckInButton, CollectPayment } from "./collect";
import type { GymRole, MembershipStatus } from "@/lib/db/database.types";

/* ============================================================================
   A-03 · Member profile.

   Everything reception needs about one person on one screen: who they are,
   whether they can train today, what they have paid, and when they last came.
   No tabs — a receptionist with someone waiting at the desk should not have
   to hunt for the renew button.
   ========================================================================= */

export const dynamic = "force-dynamic";

interface Membership {
  id: string; status: MembershipStatus; started_on: string; expires_on: string;
  price_paise: string; plans: { name: string } | null;
}
interface Payment {
  id: string; amount_paise: string; method: string; status: string;
  paid_at: string | null; reference: string | null;
}
interface Invoice { id: string; invoice_no: string; total_paise: string; issued_on: string }
interface Visit { id: string; checked_in_at: string; method: string }

export default async function MemberProfile({
  params,
}: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requireActor();
  const db = await createServerDb();

  const [{ data: gym }, { data: member }, { data: plans }] = await Promise.all([
    db.from("gyms").select("name").eq("id", actor.gymId).single(),
    db.from("members")
      .select(`id, member_code, full_name, phone, email, date_of_birth, gender,
               joined_on, emergency_contact_name, emergency_contact_phone,
               memberships ( id, status, started_on, expires_on, price_paise, plans ( name ) )`)
      .eq("gym_id", actor.gymId).eq("id", id).maybeSingle(),
    db.from("plans")
      .select("id, name, duration_days, price_paise")
      .eq("gym_id", actor.gymId).eq("is_active", true).order("sort_order"),
  ]);

  if (!member) notFound();

  const m = member as unknown as {
    id: string; member_code: string; full_name: string; phone: string;
    email: string | null; date_of_birth: string | null; gender: string | null;
    joined_on: string; emergency_contact_name: string | null;
    emergency_contact_phone: string | null; memberships: Membership[];
  };

  const [{ data: payments }, { data: invoices }, { data: visits }] = await Promise.all([
    db.from("payments").select("id, amount_paise, method, status, paid_at, reference")
      .eq("gym_id", actor.gymId).eq("member_id", id)
      .order("created_at", { ascending: false }).limit(10),
    db.from("invoices").select("id, invoice_no, total_paise, issued_on")
      .eq("gym_id", actor.gymId).eq("member_id", id)
      .order("issued_on", { ascending: false }).limit(10),
    db.from("attendance").select("id, checked_in_at, method")
      .eq("gym_id", actor.gymId).eq("member_id", id)
      .order("checked_in_at", { ascending: false }).limit(12),
  ]);

  /* The live term is the furthest-dated one; older rows are history. */
  const terms = [...(m.memberships ?? [])].sort((a, b) =>
    a.expires_on < b.expires_on ? 1 : -1);
  const current = terms[0] ?? null;
  const daysLeft = current
    ? Math.round((Date.parse(current.expires_on) - Date.parse(new Date().toDateString())) / 86_400_000)
    : null;

  const paidTotal = ((payments ?? []) as Payment[])
    .filter((p) => p.status === "paid")
    .reduce((sum, p) => sum + Number(p.amount_paise), 0);

  return (
    <AdminShell role={actor.role as GymRole} email={actor.email}
                gymName={(gym as { name: string } | null)?.name ?? "Your gym"}
                current="/admin/members">
      <PageHeader
        eyebrow={`${m.member_code} · joined ${formatDate(m.joined_on)}`}
        title={m.full_name}
        sub={[m.phone, m.email].filter(Boolean).join(" · ")}
        actions={
          <Link href="/admin/members"
                className="rounded-pill border border-neutral-300 px-4 py-2 text-[13px] font-semibold hover:bg-neutral-200">
            All members
          </Link>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          value={current ? <StatusChip status={current.status} size="md" /> : "—"}
          label="Membership"
          hint={current?.plans?.name ?? "No plan"}
        />
        <StatTile
          value={daysLeft !== null ? (daysLeft < 0 ? `${Math.abs(daysLeft)}d ago` : `${daysLeft}d`) : "—"}
          label={daysLeft !== null && daysLeft < 0 ? "Lapsed" : "Remaining"}
          hint={current ? `to ${formatDate(current.expires_on)}` : undefined}
          tone={daysLeft !== null && daysLeft <= 7 ? "warn" : "plain"}
        />
        <StatTile value={formatINR(paidTotal)} label="Paid to date"
                  hint={`${(invoices ?? []).length} invoices`} />
        <StatTile value={(visits ?? []).length} label="Recent visits"
                  hint={visits?.[0]
                    ? `last ${formatDate((visits as Visit[])[0].checked_in_at)}`
                    : "never checked in"} />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card title="Take payment · assign or renew">
          <CollectPayment
            memberId={m.id}
            plans={(plans ?? []) as { id: string; name: string; duration_days: number; price_paise: string }[]}
            currentExpiry={current?.expires_on ?? null}
          />
        </Card>

        <div className="space-y-4">
          <Card title="Front desk">
            <CheckInButton memberId={m.id} />
          </Card>

          <Card title="Membership history">
            {terms.length === 0 ? (
              <EmptyState>No membership yet — take a payment to start one.</EmptyState>
            ) : (
              <ul className="divide-y divide-neutral-300">
                {terms.map((t) => (
                  <li key={t.id} className="flex items-center gap-3 py-2.5 text-[13px]">
                    <StatusChip status={t.status} />
                    <span className="flex-1 text-neutral-700">
                      {t.plans?.name} · {formatDate(t.started_on)} – {formatDate(t.expires_on)}
                    </span>
                    <span className="tabular">{formatINR(t.price_paise)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Emergency contact">
            {m.emergency_contact_name || m.emergency_contact_phone ? (
              <p className="text-[13.5px]">
                {m.emergency_contact_name}
                {m.emergency_contact_phone && (
                  <span className="text-neutral-600"> · {m.emergency_contact_phone}</span>
                )}
              </p>
            ) : (
              <EmptyState>Not recorded.</EmptyState>
            )}
          </Card>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title="Payments and invoices">
          {(payments ?? []).length === 0 ? (
            <EmptyState>Nothing paid yet.</EmptyState>
          ) : (
            <ul className="divide-y divide-neutral-300">
              {((payments ?? []) as Payment[]).map((p, i) => {
                const inv = ((invoices ?? []) as Invoice[])[i];
                return (
                  <li key={p.id} className="flex items-center gap-3 py-2.5 text-[13px]">
                    <span className="tabular font-semibold">{formatINR(p.amount_paise)}</span>
                    <span className="text-neutral-600 uppercase">{p.method}</span>
                    <span className="flex-1 text-neutral-600">
                      {p.paid_at ? formatDate(p.paid_at) : "pending"}
                    </span>
                    {inv && (
                      <Link href={`/admin/payments/${inv.id}`}
                            className="font-mono text-[11px] text-accent-700 hover:underline">
                        {inv.invoice_no}
                      </Link>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card title="Recent visits">
          {(visits ?? []).length === 0 ? (
            <EmptyState>Has not checked in yet.</EmptyState>
          ) : (
            <ul className="divide-y divide-neutral-300">
              {((visits ?? []) as Visit[]).map((v) => (
                <li key={v.id} className="flex justify-between py-2 text-[13px]">
                  <span>{formatDate(v.checked_in_at)}</span>
                  <span className="text-neutral-600">
                    {new Date(v.checked_in_at).toLocaleTimeString("en-IN",
                      { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" })}
                    {" · "}{v.method}
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
