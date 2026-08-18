"use client";

import { useActionState, useState, useTransition } from "react";
import {
  saveWhatsAppConfig,
  sendWhatsAppTest,
  testWhatsAppConnection,
} from "@/lib/actions/whatsapp";
import { Feedback, Field, Input, Submit } from "@/components/admin/forms";

/* ============================================================================
   A-43 · Connect WhatsApp.

   The token field is write-only. It is stored in Vault by a definer function
   and there is no read path for a browser session, so the form can save one
   and can never show one — hence "saved" rather than a masked value, which
   would imply it could be revealed.
   ========================================================================= */

export function WhatsAppSetup({
  config,
  webhookUrl,
}: {
  config: {
    phone_number_id: string;
    waba_id: string | null;
    display_number: string | null;
    verify_token: string | null;
    has_token: boolean;
    last_error: string | null;
    last_ok_at: string | null;
  } | null;
  webhookUrl: string;
}) {
  const [state, action] = useActionState(saveWhatsAppConfig, null);
  const [testState, testAction] = useActionState(sendWhatsAppTest, null);
  const [probe, setProbe] = useState<{ ok: boolean; text: string } | null>(null);
  const [probing, startProbe] = useTransition();

  const connected = Boolean(config?.last_ok_at && !config?.last_error);

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <span
          className={`rounded-pill px-2.5 py-0.5 text-[11px] font-semibold ${
            connected
              ? "bg-sage-200 text-sage-800"
              : config
                ? "bg-accent-200 text-accent-800"
                : "bg-neutral-200 text-neutral-700"
          }`}
        >
          {connected ? "connected" : config ? "needs attention" : "not set up"}
        </span>
        {config?.display_number && (
          <span className="font-mono text-[12px] text-neutral-700">{config.display_number}</span>
        )}
      </div>

      {config?.last_error && (
        <p className="rounded-md bg-accent-200 px-3 py-2 text-[12.5px] text-accent-800">
          Last error from Meta: {config.last_error}
        </p>
      )}

      <form action={action} className="space-y-4">
        <Field
          label="Phone number ID"
          required
          hint="Meta → your app → WhatsApp → API setup. A long number, not the phone number itself."
        >
          <Input
            name="phone_number_id"
            required
            defaultValue={config?.phone_number_id ?? ""}
            className="font-mono"
            placeholder="123456789012345"
          />
        </Field>

        <Field label="WhatsApp Business Account ID" hint="Same screen, used for templates.">
          <Input name="waba_id" defaultValue={config?.waba_id ?? ""} className="font-mono" />
        </Field>

        <Field
          label={config?.has_token ? "Access token (saved — paste to replace)" : "Access token"}
          hint="The permanent System User token, not the 24-hour one. It is encrypted and cannot be read back."
        >
          <Input
            name="token"
            type="password"
            autoComplete="off"
            placeholder={config?.has_token ? "•••••••••• saved" : "EAAG…"}
          />
        </Field>

        <Field
          label="Webhook verify token"
          hint="Invent any string. You paste the same one into Meta when subscribing the webhook."
        >
          <Input name="verify_token" defaultValue={config?.verify_token ?? ""} className="font-mono" />
        </Field>

        <Feedback state={state} />
        <Submit>Save WhatsApp settings</Submit>
      </form>

      {/* ── prove it works ───────────────────────────────────────────────── */}
      <div className="space-y-3 border-t border-neutral-300 pt-4">
        <div>
          <button
            type="button"
            disabled={probing || !config}
            onClick={() =>
              startProbe(async () => {
                const r = await testWhatsAppConnection();
                setProbe({ ok: r.ok, text: r.ok ? (r.message ?? "OK") : r.error });
              })
            }
            className="rounded-pill border border-neutral-300 px-4 py-2 text-[13px] font-semibold text-neutral-800 hover:bg-neutral-200 disabled:opacity-40"
          >
            {probing ? "Checking…" : "Test connection"}
          </button>
          <p className="mt-1.5 text-[11.5px] text-neutral-600">
            Asks Meta who this number is. Costs nothing and sends nothing.
          </p>
          {probe && (
            <p
              role="status"
              className={`mt-2 rounded-md px-3 py-2 text-[12.5px] ${
                probe.ok ? "bg-sage-200 text-sage-800" : "bg-accent-200 text-accent-800"
              }`}
            >
              {probe.text}
            </p>
          )}
        </div>

        <form action={testAction} className="space-y-2">
          <Field
            label="Send a test message"
            hint="With country code and no +. Uses Meta's hello_world template, which every new account has."
          >
            <Input name="phone" placeholder="919845012345" className="font-mono" />
          </Field>
          <Feedback state={testState} />
          <Submit className="!px-4 !py-2 !text-[12.5px]">Send test</Submit>
        </form>
      </div>

      {/* ── webhook ──────────────────────────────────────────────────────── */}
      <div className="border-t border-neutral-300 pt-4">
        <h3 className="font-mono text-[11px] tracking-[0.1em] text-neutral-600 uppercase">
          Webhook
        </h3>
        <p className="mt-2 text-[12.5px] text-neutral-700">
          In Meta → WhatsApp → Configuration, set the callback URL to:
        </p>
        <code className="mt-1.5 block overflow-x-auto rounded-md bg-bg px-3 py-2 font-mono text-[11.5px]">
          {webhookUrl}
        </code>
        <p className="mt-2 text-[11.5px] text-neutral-600">
          Use the verify token above, then subscribe to the <b>messages</b> field.
          Without this the log stops at &ldquo;sent&rdquo; — which only means Meta
          accepted it, not that it reached anyone.
        </p>
      </div>
    </div>
  );
}
