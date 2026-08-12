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

/* ── WhatsApp, via Meta Cloud API ─────────────────────────────────────────── */

const whatsappAdapter: ChannelAdapter = {
  name: "whatsapp-cloud",
  get configured() {
    return Boolean(process.env.META_SYSTEM_USER_TOKEN && process.env.META_PHONE_NUMBER_ID);
  },

  async send(message) {
    const token = process.env.META_SYSTEM_USER_TOKEN;
    const phoneNumberId = process.env.META_PHONE_NUMBER_ID;
    if (!token || !phoneNumberId) {
      return { ok: false, error: "whatsapp not configured", retryable: false };
    }
    if (!message.toPhone) {
      return { ok: false, error: "no phone number on member", retryable: false };
    }

    try {
      const res = await fetch(
        `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`,
        {
          method: "POST",
          headers: {
            authorization: `Bearer ${token}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            to: message.toPhone.replace(/^\+/, ""),
            type: "text",
            text: { body: message.body },
          }),
        },
      );

      const json = (await res.json()) as {
        messages?: { id: string }[];
        error?: { message?: string; code?: number };
      };

      if (!res.ok) {
        /* 4xx is our mistake — a bad template or an unregistered number — and
           retrying it just burns quota. 5xx and 429 are worth another go. */
        const retryable = res.status >= 500 || res.status === 429;
        return {
          ok: false,
          error: json.error?.message ?? `HTTP ${res.status}`,
          retryable,
        };
      }

      return { ok: true, providerMessageId: json.messages?.[0]?.id ?? "unknown" };
    } catch (e) {
      // Network failure: always worth retrying.
      return { ok: false, error: (e as Error).message, retryable: true };
    }
  },
};

/* ── registry ─────────────────────────────────────────────────────────────── */

const ADAPTERS: Partial<Record<NotificationChannel, ChannelAdapter>> = {
  whatsapp: whatsappAdapter,
};

/** Returns the configured adapter for a channel, or the log fallback. */
export function adapterFor(channel: NotificationChannel): ChannelAdapter {
  const adapter = ADAPTERS[channel];
  return adapter?.configured ? adapter : logAdapter;
}

/** For the settings screen: which channels can actually deliver today. */
export function channelStatus(): Record<string, boolean> {
  return {
    whatsapp: whatsappAdapter.configured,
    sms: Boolean(process.env.MSG91_AUTH_KEY),
    email: Boolean(process.env.RESEND_API_KEY),
    push: Boolean(process.env.VAPID_PRIVATE_KEY),
  };
}
