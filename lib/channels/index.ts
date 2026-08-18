import "server-only";

/* ============================================================================
   Channel adapters.

   Every channel presents the same tiny interface so the drain worker never
   branches on provider. Adding SMS or email later means adding a file here,
   not touching the worker.

   WhatsApp goes direct to Meta's Cloud API rather than through a BSP: it
   saves the ~₹2,500/mo platform fee and ~26% on every utility message, and
   the template and delivery-log screens (A-35, A-37) are being built anyway.

   Until credentials exist, every adapter falls back to `log`, which records
   the message as sent and prints it. That keeps the whole reminder ladder
   exercisable end to end before a single external account is created.
   ========================================================================= */

import type { NotificationChannel } from "@/lib/db/database.types";

export interface OutboundMessage {
  channel: NotificationChannel;
  toPhone: string | null;
  toEmail: string | null;
  subject: string | null;
  body: string;
}

export type SendResult =
  | { ok: true; providerMessageId: string }
  | { ok: false; error: string; retryable: boolean };

export interface ChannelAdapter {
  readonly name: string;
  readonly configured: boolean;
  send(message: OutboundMessage): Promise<SendResult>;
}

/* ── the fallback ─────────────────────────────────────────────────────────── */

const logAdapter: ChannelAdapter = {
  name: "log",
  configured: true,
  async send(message) {
    console.info(
      `[outbox:log] ${message.channel} -> ${message.toPhone ?? message.toEmail}: ` +
        message.body.slice(0, 120),
    );
    return { ok: true, providerMessageId: `log-${crypto.randomUUID()}` };
  },
};

/* ── registry ─────────────────────────────────────────────────────────────── */

/** The fallback for every channel with nothing wired up behind it. */
export function adapterFor(): ChannelAdapter {
  return logAdapter;
}

/** For the settings screen: which channels can actually deliver today. */
export function channelStatus(): Record<string, boolean> {
  return {
    sms: Boolean(process.env.MSG91_AUTH_KEY),
    email: Boolean(process.env.RESEND_API_KEY),
    push: Boolean(process.env.VAPID_PRIVATE_KEY),
  };
}
