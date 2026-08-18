import { headers } from "next/headers";
import { createServerDb, requireActor } from "@/lib/db/server";
import { Card, PageHeader } from "@/components/admin/shell";
import { channelStatus } from "@/lib/channels";
import { GymSettingsForm } from "./form";
import { WhatsAppSetup } from "./whatsapp";

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

  const { data: wa } = await db
    .from("whatsapp_configs")
    .select(
      "phone_number_id, waba_id, display_number, verify_token, token_secret_id, last_error, last_ok_at",
    )
    .eq("gym_id", actor.gymId)
    .maybeSingle();

  const w = wa as {
    phone_number_id: string;
    waba_id: string | null;
    display_number: string | null;
    verify_token: string | null;
    token_secret_id: string | null;
    last_error: string | null;
    last_ok_at: string | null;
  } | null;

  /* Built from the request rather than hardcoded. This app moved host
     mid-build, and a stale webhook URL fails silently — Meta just stops
     delivering receipts and the log quietly stops at "sent". */
  const host = (await headers()).get("host") ?? "your-domain";
  const webhookUrl = `https://${host}/api/webhooks/whatsapp`;

  const channels = channelStatus();

  return (
    <>
      <PageHeader
        eyebrow="Settings"
        title="Gym profile"
        sub="Appears on invoices and in every automated message."
      />

      <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
        <Card><GymSettingsForm gym={g} /></Card>

        <div className="space-y-4">
          <Card title="WhatsApp">
            <WhatsAppSetup
              webhookUrl={webhookUrl}
              config={
                w
                  ? {
                      phone_number_id: w.phone_number_id,
                      waba_id: w.waba_id,
                      display_number: w.display_number,
                      verify_token: w.verify_token,
                      /* Whether a token exists, never the token. There is no
                         read path for it from a browser session at all. */
                      has_token: Boolean(w.token_secret_id),
                      last_error: w.last_error,
                      last_ok_at: w.last_ok_at,
                    }
                  : null
              }
            />
          </Card>

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
    </>
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
