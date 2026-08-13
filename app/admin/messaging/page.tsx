import { createServerDb, requireActor } from "@/lib/db/server";
import { Card, EmptyState, PageHeader, StatTile } from "@/components/admin/shell";
import { can } from "@/lib/auth/permissions";
import { channelStatus } from "@/lib/channels";
import { formatDate } from "@/lib/money";
import { RuleToggle, TemplateEditor, RetryButton } from "./client";
import type {
  GymRole,
  NotificationChannel,
  NotificationStatus,
} from "@/lib/db/database.types";

/* ============================================================================
   A-35 / A-36 / A-37 · Messaging.

   Three questions in one screen, in the order an owner asks them:

     1. What goes out, and when       → the reminder ladder
     2. What does it say              → templates, editable
     3. Did Ravi actually get it      → the delivery log

   (3) is the reason ADR-3 rejected a workflow vendor. The outbox IS the
   record; when a member says nobody told them, the answer is on this page
   with a timestamp, not in a third-party dashboard.
   ========================================================================= */

export const dynamic = "force-dynamic";

interface Rule {
  id: string;
  key: string;
  offset_days: number;
  channels: NotificationChannel[];
  is_active: boolean;
}

interface Template {
  id: string;
  key: string;
  channel: NotificationChannel;
  subject: string | null;
  body: string;
  is_active: boolean;
}

interface OutboxRow {
  id: string;
  rule_key: string;
  channel: NotificationChannel;
  status: NotificationStatus;
  attempts: number;
  error: string | null;
  body: string;
  to_phone: string | null;
  to_email: string | null;
  sent_at: string | null;
  created_at: string;
  members: { full_name: string } | null;
}

/** Human wording for a rule key. Anything unrecognised falls back to the key
 *  itself — better an ugly label than a blank row. */
function describeRule(key: string, offset: number): string {
  const days = Math.abs(offset);
  const plural = days === 1 ? "day" : "days";

  /* expiry_0d must be tested before the expiry_* prefix, or it falls through
     and renders as "0 days before expiry". */
  if (key === "expiry_0d") return "On the day it expires";
  if (key.startsWith("expiry")) return `${days} ${plural} before expiry`;
  if (key.startsWith("expired")) return `${days} ${plural} after it lapses`;
  if (key.startsWith("inactive")) {
    const n = key.replace(/\D/g, "");
    return `After ${n} ${n === "1" ? "day" : "days"} without a visit`;
  }
  return key;
}

export default async function MessagingPage() {
  const actor = await requireActor();
  const db = await createServerDb();
  const role = actor.role as GymRole;

  const [{ data: rules }, { data: templates }, { data: outbox }] =
    await Promise.all([
      db.from("reminder_rules").select("*").eq("gym_id", actor.gymId).order("offset_days"),
      db.from("message_templates").select("*").eq("gym_id", actor.gymId).order("key"),
      db
        .from("notification_outbox")
        .select(
          "id, rule_key, channel, status, attempts, error, body, to_phone, to_email, sent_at, created_at, members(full_name)",
        )
        .eq("gym_id", actor.gymId)
        .order("created_at", { ascending: false })
        .limit(60),
    ]);

  const ruleRows = (rules ?? []) as Rule[];
  const tplRows = (templates ?? []) as Template[];
  const log = (outbox ?? []) as unknown as OutboxRow[];
  const mayEdit = can(role, "messaging", "edit");
  const channels = channelStatus();

  const counts = log.reduce<Record<string, number>>((acc, r) => {
    acc[r.status] = (acc[r.status] ?? 0) + 1;
    return acc;
  }, {});
  const failed = log.filter((r) => r.status === "failed");

  /* One editor per rule key, WhatsApp only. Push and email carry the same
     wording today, and showing three identical textareas per step would turn
     a 9-row screen into 27. */
  const whatsappTemplates = tplRows.filter((t) => t.channel === "whatsapp");

  return (
    <>
      <PageHeader
        eyebrow="Messaging"
        title="Reminders"
        sub="Renewal and win-back messages, and proof of what was sent."
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile value={ruleRows.filter((r) => r.is_active).length} label="Active rules"
                  hint={`of ${ruleRows.length} in the ladder`} />
        <StatTile value={(counts.sent ?? 0) + (counts.delivered ?? 0)} label="Sent"
                  hint="last 60 messages" />
        <StatTile value={counts.queued ?? 0} label="Waiting to go" />
        <StatTile value={failed.length} label="Failed"
                  tone={failed.length ? "warn" : "plain"}
                  hint={failed.length ? "needs a look" : "nothing stuck"} />
      </div>

      {!channels.whatsapp && (
        <p className="mb-5 rounded-md bg-accent-200 px-4 py-3 text-[13px] text-accent-800">
          WhatsApp is not connected yet, so messages are written to the server
          log instead of being delivered. The schedule, wording and dedup all
          work — only the last hop is missing. Add the Meta credentials in
          <span className="font-mono"> .env.local</span> to switch it on.
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="The ladder">
          {ruleRows.length === 0 ? (
            <EmptyState>No reminder rules. Run the bootstrap script to seed them.</EmptyState>
          ) : (
            <ul className="divide-y divide-neutral-300">
              {ruleRows.map((r) => (
                <li key={r.id} className="flex items-center gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="text-[13.5px]">{describeRule(r.key, r.offset_days)}</div>
                    <div className="font-mono text-[10.5px] text-neutral-600">
                      {r.key} · {r.channels.join(", ")}
                    </div>
                  </div>
                  <RuleToggle id={r.id} on={r.is_active} disabled={!mayEdit} />
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-[11.5px] text-neutral-600">
            Each step sends at most once per member per day, guaranteed by a
            unique index — a redeploy mid-run cannot double-message anyone.
          </p>
        </Card>

        <Card title="Delivery log">
          {log.length === 0 ? (
            <EmptyState>
              Nothing sent yet. The daily job queues reminders at the hour set
              in Settings.
            </EmptyState>
          ) : (
            <ul className="max-h-[520px] divide-y divide-neutral-300 overflow-y-auto">
              {log.map((m) => (
                <li key={m.id} className="py-2.5">
                  <div className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-[13px] font-medium">
                      {m.members?.full_name ?? m.to_phone ?? m.to_email ?? "Unknown"}
                    </span>
                    <StatusPill status={m.status} />
                    <span className="text-[11px] whitespace-nowrap text-neutral-600">
                      {formatDate(m.sent_at ?? m.created_at)}
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-[11.5px] text-neutral-700">{m.body}</p>
                  <div className="mt-1 flex items-center gap-2">
                    <span className="font-mono text-[10.5px] text-neutral-600">
                      {m.rule_key} · {m.channel}
                      {m.attempts > 1 && ` · ${m.attempts} attempts`}
                    </span>
                    {m.status === "failed" && mayEdit && <RetryButton id={m.id} />}
                  </div>
                  {m.error && (
                    <p className="mt-1 text-[11px] text-accent-700">{m.error}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="mt-4">
        <Card title="What the messages say">
          {whatsappTemplates.length === 0 ? (
            <EmptyState>No templates yet.</EmptyState>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {whatsappTemplates.map((t) => (
                <TemplateEditor
                  key={t.id}
                  id={t.id}
                  label={t.key}
                  body={t.body}
                  disabled={!mayEdit}
                />
              ))}
            </div>
          )}
          <p className="mt-4 text-[11.5px] text-neutral-600">
            Placeholders: <span className="font-mono">{"{{name}} {{gym}} {{plan}} {{expiry}} {{days}}"}</span>{" "}
            — substituted when the message is queued, so a later edit does not
            change what has already gone out.
          </p>
        </Card>
      </div>
    </>
  );
}

function StatusPill({ status }: { status: NotificationStatus }) {
  const tone =
    status === "failed" || status === "cancelled"
      ? "bg-accent-200 text-accent-800"
      : status === "sent" || status === "delivered" || status === "read"
        ? "bg-sage-200 text-sage-800"
        : "bg-neutral-200 text-neutral-700";
  return (
    <span className={`rounded-pill px-2 py-0.5 text-[10.5px] font-semibold ${tone}`}>
      {status}
    </span>
  );
}
