import Link from "next/link";
import { createServerDb, requireActor } from "@/lib/db/server";
import { Card, EmptyState, PageHeader, StatTile } from "@/components/admin/shell";
import { formatDate, formatINR, formatINRCompact } from "@/lib/money";

/* ============================================================================
   A-17 · Payments ledger, with every invoice one click away.
   ========================================================================= */

export const dynamic = "force-dynamic";

interface Row {
  id: string;
  amount_paise: string;
  method: string;
  status: string;
  paid_at: string | null;
  members: { full_name: string; member_code: string } | null;
}

interface Inv {
  id: string;
  invoice_no: string;
  payment_id: string | null;
}

const STATUS_STYLE: Record<string, string> = {
  paid: "bg-sage-200 text-sage-800",
  pending: "bg-accent-200 text-accent-800",
  failed: "bg-accent-300 text-accent-900",
  refunded: "bg-neutral-300 text-neutral-800",
};

export default async function PaymentsPage() {
  const actor = await requireActor();
  const db = await createServerDb();

  const [{ data: payments }, { data: invoices }] = await Promise.all([
    db
      .from("payments")
      .select(
        "id, amount_paise, method, status, paid_at, members(full_name, member_code)",
      )
      .eq("gym_id", actor.gymId)
      .order("created_at", { ascending: false })
      .limit(100),
    db.from("invoices").select("id, invoice_no, payment_id").eq("gym_id", actor.gymId),
  ]);

  const rows = (payments ?? []) as unknown as Row[];
  const invByPayment = new Map(
    ((invoices ?? []) as Inv[]).map((i) => [i.payment_id ?? "", i]),
  );

  const collected = rows
    .filter((r) => r.status === "paid")
    .reduce((s, r) => s + Number(r.amount_paise), 0);
  const pending = rows
    .filter((r) => r.status === "pending")
    .reduce((s, r) => s + Number(r.amount_paise), 0);

  return (
    <>
      <PageHeader
        eyebrow="Payments"
        title={`${rows.length} ${rows.length === 1 ? "transaction" : "transactions"}`}
        sub="Most recent first."
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile value={formatINRCompact(collected)} label="Collected" tone="good" />
        <StatTile
          value={formatINRCompact(pending)}
          label="Pending"
          tone={pending > 0 ? "warn" : "plain"}
        />
        <StatTile value={(invoices ?? []).length} label="Invoices issued" />
        <StatTile value={rows.length} label="Transactions" />
      </div>

      <Card className="p-0">
        {rows.length === 0 ? (
          <EmptyState>
            No payments yet. Take one from a member&rsquo;s profile.
          </EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13.5px]">
              <thead>
                <tr className="border-b border-neutral-300 text-left">
                  {["Member", "Amount", "Method", "Status", "Date", "Invoice"].map((h) => (
                    <th
                      key={h}
                      className="px-4 py-2.5 font-mono text-[10.5px] font-normal tracking-[0.08em] text-neutral-600 uppercase"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const inv = invByPayment.get(r.id);
                  return (
                    <tr
                      key={r.id}
                      className="border-b border-neutral-200 last:border-0 hover:bg-neutral-200/40"
                    >
                      <td className="px-4 py-3">
                        <div className="font-medium">{r.members?.full_name ?? "—"}</div>
                        <div className="font-mono text-[11px] text-neutral-600">
                          {r.members?.member_code}
                        </div>
                      </td>
                      <td className="tabular px-4 py-3 font-semibold">
                        {formatINR(r.amount_paise)}
                      </td>
                      <td className="px-4 py-3 text-neutral-700 uppercase">{r.method}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-pill px-2.5 py-0.5 text-[11px] font-semibold ${
                            STATUS_STYLE[r.status] ?? "bg-neutral-200 text-neutral-700"
                          }`}
                        >
                          {r.status}
                        </span>
                      </td>
                      <td className="tabular px-4 py-3 text-neutral-700">
                        {r.paid_at ? formatDate(r.paid_at) : "—"}
                      </td>
                      <td className="px-4 py-3">
                        {inv ? (
                          <Link
                            href={`/admin/payments/${inv.id}`}
                            className="font-mono text-[11.5px] text-accent-700 hover:underline"
                          >
                            {inv.invoice_no}
                          </Link>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
