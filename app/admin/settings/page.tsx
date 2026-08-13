import { createServerDb, requireActor } from "@/lib/db/server";
import { AdminShell, Card, PageHeader } from "@/components/admin/shell";
import { channelStatus } from "@/lib/channels";
import { GymSettingsForm } from "./form";
import type { GymRole } from "@/lib/db/database.types";

/* ============================================================================
   A-42 · Settings.

   The GSTIN is the reason this screen exists. Invoices carry a visible
   warning without one, and there was previously no way to enter it short of
   the Supabase dashboard.

   Channel status is read-only and honest: it reports which delivery channels
   have credentials configured, so "why did nothing send" has an answer on
   the screen rather than in the server log.
   ========================================================================= */

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const actor = await requireActor();
  const db = await createServerDb();

  const { data: gym } = await db
    .from("gyms")
    .select("id, name, slug, address, phone, email, gstin, timezone, currency, reminder_hour")
    .eq("id", actor.gymId)
    .single();

  const g = gym as {
    id: string; name: string; slug: string; address: string | null;
    phone: string | null; email: string | null; gstin: string | null;
    timezone: string; currency: string; reminder_hour: number;
  };

  const channels = channelStatus();

  return (
    <AdminShell role={actor.role as GymRole} email={actor.email}
                gymName={g.name} current="/admin/settings">
      <PageHeader
        eyebrow="Settings"
        title="Gym profile"
        sub="Appears on invoices and in every automated message."
      />

      <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
        <Card><GymSettingsForm gym={g} /></Card>

        <div className="space-y-4">
          <Card title="Message channels">
            <ul className="divide-y divide-neutral-300">
              {Object.entries(channels).map(([name, on]) => (
                <li key={name} className="flex items-center justify-between py-2.5 text-[13.5px]">
                  <span className="capitalize">{name}</span>
                  <span
                    className={`rounded-pill px-2.5 py-0.5 text-[11px] font-semibold ${
                      on ? "bg-sage-200 text-sage-800" : "bg-neutral-200 text-neutral-700"
                    }`}
                  >
                    {on ? "configured" : "not set up"}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[11.5px] text-neutral-600">
              Anything not set up falls back to a logging adapter: reminders are
              recorded as sent and printed to the server log, so the schedule can
              be tested before the accounts exist.
            </p>
          </Card>

          <Card title="Reference">
            <dl className="space-y-2 text-[13px]">
              <Row label="Gym ID" value={g.id.slice(0, 8) + "…"} mono />
              <Row label="Slug" value={g.slug} mono />
              <Row label="Timezone" value={g.timezone} />
              <Row label="Currency" value={g.currency} />
            </dl>
          </Card>
        </div>
      </div>
    </AdminShell>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-neutral-700">{label}</dt>
      <dd className={mono ? "font-mono text-[12px]" : ""}>{value}</dd>
    </div>
  );
}
