import { NextResponse, type NextRequest } from "next/server";
import { unsafeAcrossAllGyms } from "@/lib/db/admin";
import { adapterFor } from "@/lib/channels";
import { sendWhatsApp, type WhatsAppConfig } from "@/lib/channels/whatsapp";
import type { NotificationChannel } from "@/lib/db/database.types";

/* ============================================================================
   Job endpoints, called by pg_cron inside Supabase.

     POST /api/jobs/daily   — status sweep, reminder ladder, inactivity scan
     POST /api/jobs/drain   — send whatever is queued in the outbox
     POST /api/jobs/hourly  — requeue messages a dead worker abandoned

   These run across all tenants by design: that is what a platform-wide
   scheduler is. They are the only place `unsafeAcrossAllGyms` is permitted,
   and guard-service-role.ts allows it here and nowhere else.

   Authenticated by a shared secret rather than a user session, because there
   is no user — pg_cron is calling. Without it, anyone who guesses the URL
   could drain the outbox or replay the daily job.
   ========================================================================= */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const JOBS = ["daily", "drain", "hourly"] as const;
type Job = (typeof JOBS)[number];

function authorised(request: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;               // unset means closed, not open
  const given = request.headers.get("x-cron-secret");
  return typeof given === "string" && timingSafeEqual(given, expected);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ job: string }> },
) {
  if (!authorised(request)) {
    return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  }

  const { job } = await params;
  if (!JOBS.includes(job as Job)) {
    return NextResponse.json({ error: `unknown job "${job}"` }, { status: 404 });
  }

  const started = Date.now();
  try {
    const result =
      job === "daily" ? await runDaily()
      : job === "drain" ? await runDrain()
      : await runHourly();

    return NextResponse.json({ job, ms: Date.now() - started, ...result });
  } catch (e) {
    console.error(`[job:${job}] failed`, e);
    return NextResponse.json(
      { job, error: (e as Error).message, ms: Date.now() - started },
      { status: 500 },
    );
  }
}

/* ── daily ────────────────────────────────────────────────────────────────── */

async function runDaily() {
  const db = unsafeAcrossAllGyms("cron-worker");
  const { data, error } = await db.rpc("job_daily");
  if (error) throw new Error(error.message);
  return { result: data };
}

async function runHourly() {
  const db = unsafeAcrossAllGyms("cron-worker");
  const { data, error } = await db.rpc("job_requeue_stuck");
  if (error) throw new Error(error.message);
  return { requeued: data };
}

/* ── drain ────────────────────────────────────────────────────────────────── */

interface OutboxRow {
  id: string;
  gym_id: string;
  rule_key: string;
  channel: NotificationChannel;
  to_phone: string | null;
  to_email: string | null;
  subject: string | null;
  body: string;
  vars: Record<string, string> | null;
}

/** A gym's WhatsApp credentials plus the templates it may send. */
interface GymWhatsApp {
  config: WhatsAppConfig | null;
  /** rule_key -> the approved template to send for it. */
  templates: Map<string, { name: string; language: string; paramKeys: string[] }>;
}

/**
 * Loads a gym's WhatsApp setup once per drain, not once per message.
 *
 * A batch is usually one gym's reminder ladder firing together, so without
 * this the same two queries run fifty times — and the token read hits Vault
 * each time.
 */
async function loadWhatsApp(
  db: ReturnType<typeof unsafeAcrossAllGyms>,
  gymId: string,
): Promise<GymWhatsApp> {
  const [{ data: cfg }, { data: tpl }] = await Promise.all([
    db
      .from("whatsapp_configs")
      .select("phone_number_id, token_secret_id")
      .eq("gym_id", gymId)
      .maybeSingle(),
    db
      .from("message_templates")
      .select("key, provider_template_name, provider_language, param_keys")
      .eq("gym_id", gymId)
      .eq("channel", "whatsapp")
      .eq("is_active", true),
  ]);

  const templates = new Map<string, { name: string; language: string; paramKeys: string[] }>();
  for (const t of (tpl ?? []) as {
    key: string;
    provider_template_name: string | null;
    provider_language: string | null;
    param_keys: string[] | null;
  }[]) {
    if (!t.provider_template_name) continue;
    templates.set(t.key, {
      name: t.provider_template_name,
      language: t.provider_language ?? "en",
      paramKeys: t.param_keys ?? [],
    });
  }

  const row = cfg as { phone_number_id: string; token_secret_id: string | null } | null;
  if (!row?.token_secret_id) return { config: null, templates };

  /* The token is only ever decrypted here, by the service role, at send
     time. No authenticated session can read it back. */
  const { data: secret } = await db
    .schema("vault")
    .from("decrypted_secrets")
    .select("decrypted_secret")
    .eq("id", row.token_secret_id)
    .maybeSingle();

  const token = (secret as { decrypted_secret: string } | null)?.decrypted_secret;
  if (!token) return { config: null, templates };

  return { config: { phoneNumberId: row.phone_number_id, token }, templates };
}

/**
 * Claims a batch and sends it.
 *
 * claim_outbox_batch uses FOR UPDATE SKIP LOCKED, so two overlapping runs
 * never grab the same message — which matters the first time the every-two-
 * minutes schedule overlaps a slow provider.
 *
 * Sends run concurrently but the batch stays small: a provider that starts
 * failing should cost one batch of latency, not a stuck function.
 */
async function runDrain() {
  const db = unsafeAcrossAllGyms("cron-worker");

  const { data, error } = await db.rpc("claim_outbox_batch", { p_limit: 50 });
  if (error) throw new Error(error.message);

  const batch = (data ?? []) as OutboxRow[];
  if (batch.length === 0) return { claimed: 0, sent: 0, failed: 0 };

  /* One load per gym in the batch, shared across its messages. */
  const whatsappByGym = new Map<string, Promise<GymWhatsApp>>();
  const gymWhatsApp = (gymId: string) => {
    let p = whatsappByGym.get(gymId);
    if (!p) { p = loadWhatsApp(db, gymId); whatsappByGym.set(gymId, p); }
    return p;
  };

  const results = await Promise.all(
    batch.map(async (row) => {
      let outcome;

      if (row.channel === "whatsapp") {
        const { config, templates } = await gymWhatsApp(row.gym_id);
        if (!config) {
          /* Not an error worth retrying: the gym has not connected WhatsApp.
             Logged so the message is visibly not-sent rather than silently
             counted as delivered, which is what the log adapter would do. */
          outcome = {
            ok: false as const,
            error: "WhatsApp is not connected for this gym (Settings → WhatsApp)",
            retryable: false,
          };
        } else {
          const t = templates.get(row.rule_key);
          const vars = row.vars ?? {};
          outcome = await sendWhatsApp(
            config,
            row.to_phone,
            row.body,
            t
              ? {
                  name: t.name,
                  language: t.language,
                  params: t.paramKeys.map((k) => vars[k] ?? ""),
                }
              : null,
          );
        }
      } else {
        const adapter = adapterFor();
        outcome = await adapter.send({
          channel: row.channel,
          toPhone: row.to_phone,
          toEmail: row.to_email,
          subject: row.subject,
          body: row.body,
        });
      }

      await db.rpc("mark_outbox_result", {
        p_id: row.id,
        p_ok: outcome.ok,
        p_provider_message_id: outcome.ok ? outcome.providerMessageId : null,
        /* A non-retryable failure is recorded with attempts already at the
           cap, so the backoff does not keep re-sending something that can
           never succeed — a bad phone number is not a transient error. */
        p_error: outcome.ok ? null : outcome.error,
      });

      if (!outcome.ok && !outcome.retryable) {
        await db.from("notification_outbox").update({ attempts: 3 }).eq("id", row.id);
      }

      return outcome.ok;
    }),
  );

  const sent = results.filter(Boolean).length;
  return { claimed: batch.length, sent, failed: batch.length - sent };
}
