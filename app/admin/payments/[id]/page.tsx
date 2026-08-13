import Link from "next/link";
import { notFound } from "next/navigation";
import { createServerDb, requireActor } from "@/lib/db/server";
import { AdminShell } from "@/components/admin/shell";
import { formatDate, formatINRExact, SAC_FITNESS } from "@/lib/money";
import type { GymRole } from "@/lib/db/database.types";

/* ============================================================================
   A-19 · Tax invoice.

   Printable, and printed is the point — Indian gyms hand these over. Every
   field a GST invoice needs is here: supplier name and GSTIN as they were at
   issue time, SAC code, the CGST/SGST split, and a gap-free number.

   The supplier details are read from the invoice row, not the gyms table. A
   gym that later changes its name or registers for GST must not retroactively
   alter invoices already given to members.
   ========================================================================= */

export const dynamic = "force-dynamic";

interface Invoice {
  id: string;
  invoice_no: string;
  fiscal_year: string;
  issued_on: string;
  gym_name: string;
  gym_gstin: string | null;
  sac_code: string;
  description: string;
  taxable_paise: string;
  cgst_paise: string;
  sgst_paise: string;
  igst_paise: string;
  total_paise: string;
  is_credit_note: boolean;
  members: { full_name: string; member_code: string; phone: string; address: string | null } | null;
  payments: { method: string; paid_at: string | null; reference: string | null } | null;
}

export default async function InvoicePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const actor = await requireActor();
  const db = await createServerDb();

  const [{ data: gym }, { data }] = await Promise.all([
    db.from("gyms").select("name, address, phone").eq("id", actor.gymId).single(),
    db
      .from("invoices")
      .select(
        `*, members(full_name, member_code, phone, address),
         payments(method, paid_at, reference)`,
      )
      .eq("gym_id", actor.gymId)
      .eq("id", id)
      .maybeSingle(),
  ]);

  if (!data) notFound();
  const inv = data as unknown as Invoice;
  const g = gym as { name: string; address: string | null; phone: string | null } | null;

  const tax =
    Number(inv.cgst_paise) + Number(inv.sgst_paise) + Number(inv.igst_paise);
  const interState = Number(inv.igst_paise) > 0;

  return (
    <AdminShell
      role={actor.role as GymRole}
      gymName={g?.name ?? "Your gym"}
      current="/admin/payments"
    >
      <div className="mb-4 flex items-center justify-between print:hidden">
        <Link
          href="/admin/payments"
          className="text-[13px] text-neutral-700 hover:underline"
        >
          ← All payments
        </Link>
        <p className="text-[12px] text-neutral-600">
          Use your browser&rsquo;s print dialog to save as PDF.
        </p>
      </div>

      {/* Fixed A4-ish width so the printed page matches the screen. */}
      <article className="mx-auto max-w-[760px] rounded-lg bg-surface p-8 print:bg-white print:p-0">
        <header className="flex items-start justify-between gap-6 border-b border-neutral-300 pb-5">
          <div>
            <h1 className="text-[24px] leading-tight">{inv.gym_name}</h1>
            {g?.address && (
              <p className="mt-1 max-w-[280px] text-[12px] text-neutral-700">{g.address}</p>
            )}
            {g?.phone && <p className="text-[12px] text-neutral-700">{g.phone}</p>}
            {inv.gym_gstin ? (
              <p className="mt-1.5 font-mono text-[11.5px]">GSTIN {inv.gym_gstin}</p>
            ) : (
              <p className="mt-1.5 rounded-sm bg-accent-200 px-2 py-0.5 text-[11px] text-accent-800 print:hidden">
                No GSTIN on file — add one in Settings before issuing real invoices.
              </p>
            )}
          </div>

          <div className="text-right">
            <p className="font-mono text-[11px] tracking-[0.1em] text-neutral-600 uppercase">
              {inv.is_credit_note ? "Credit note" : "Tax invoice"}
            </p>
            <p className="mt-1 font-mono text-[15px] font-bold">{inv.invoice_no}</p>
            <p className="mt-1 text-[12px] text-neutral-700">
              {formatDate(inv.issued_on)}
            </p>
            <p className="text-[11.5px] text-neutral-600">FY {inv.fiscal_year}</p>
          </div>
        </header>

        <section className="grid gap-6 py-5 sm:grid-cols-2">
          <div>
            <h2 className="font-mono text-[10.5px] tracking-[0.1em] text-neutral-600 uppercase">
              Billed to
            </h2>
            <p className="mt-1.5 text-[14px] font-semibold">{inv.members?.full_name}</p>
            <p className="text-[12.5px] text-neutral-700">
              {inv.members?.member_code} · {inv.members?.phone}
            </p>
            {inv.members?.address && (
              <p className="mt-0.5 text-[12px] text-neutral-700">{inv.members.address}</p>
            )}
          </div>
          <div className="sm:text-right">
            <h2 className="font-mono text-[10.5px] tracking-[0.1em] text-neutral-600 uppercase">
              Payment
            </h2>
            <p className="mt-1.5 text-[14px] uppercase">{inv.payments?.method ?? "—"}</p>
            {inv.payments?.paid_at && (
              <p className="text-[12.5px] text-neutral-700">
                {formatDate(inv.payments.paid_at)}
              </p>
            )}
            {inv.payments?.reference && (
              <p className="font-mono text-[11.5px] text-neutral-600">
                ref {inv.payments.reference}
              </p>
            )}
          </div>
        </section>

        <table className="w-full border-t border-neutral-300 text-[13px]">
          <thead>
            <tr className="text-left">
              <th className="py-2.5 font-mono text-[10.5px] font-normal tracking-[0.08em] text-neutral-600 uppercase">
                Description
              </th>
              <th className="py-2.5 font-mono text-[10.5px] font-normal tracking-[0.08em] text-neutral-600 uppercase">
                SAC
              </th>
              <th className="py-2.5 text-right font-mono text-[10.5px] font-normal tracking-[0.08em] text-neutral-600 uppercase">
                Amount
              </th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-t border-neutral-200">
              <td className="py-3">{inv.description}</td>
              <td className="tabular py-3 font-mono text-[12px]">
                {inv.sac_code || SAC_FITNESS}
              </td>
              <td className="tabular py-3 text-right">
                {formatINRExact(inv.taxable_paise)}
              </td>
            </tr>
          </tbody>
        </table>

        <div className="mt-4 flex justify-end">
          <dl className="w-full max-w-[280px] space-y-1.5 text-[13px]">
            <Row label="Taxable value" value={formatINRExact(inv.taxable_paise)} />
            {interState ? (
              <Row label="IGST 18%" value={formatINRExact(inv.igst_paise)} />
            ) : (
              <>
                <Row label="CGST 9%" value={formatINRExact(inv.cgst_paise)} />
                <Row label="SGST 9%" value={formatINRExact(inv.sgst_paise)} />
              </>
            )}
            <div className="flex justify-between border-t border-neutral-300 pt-2 text-[16px] font-bold">
              <dt>Total</dt>
              <dd className="tabular">{formatINRExact(inv.total_paise)}</dd>
            </div>
          </dl>
        </div>

        <footer className="mt-8 border-t border-neutral-300 pt-4 text-[11px] text-neutral-600">
          <p>
            Tax of {formatINRExact(tax)} charged at 18% on{" "}
            {interState ? "inter-state" : "intra-state"} supply of services under SAC{" "}
            {inv.sac_code || SAC_FITNESS}.
          </p>
          <p className="mt-1">
            Computer-generated invoice. Valid without signature.
          </p>
        </footer>
      </article>
    </AdminShell>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-neutral-700">{label}</dt>
      <dd className="tabular">{value}</dd>
    </div>
  );
}
