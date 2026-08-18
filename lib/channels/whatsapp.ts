import "server-only";

/* ============================================================================
   WhatsApp, via Meta's Cloud API, with per-gym credentials.

   Two things here are not obvious and both are load-bearing.

   1. TEMPLATES, NOT TEXT. Outside a 24-hour window opened by the member
      messaging the gym, WhatsApp refuses free-form text with error 131047
      ("Re-engagement message"). Every reminder this product sends is
      business-initiated, so in production a text send fails every time. The
      first version of this adapter sent text and would have failed 100% of
      real reminders while passing every test against the log adapter.

   2. CREDENTIALS ARE PER GYM. Under Meta's Tech Provider model each gym
      onboards its own WhatsApp Business Account, so the token, the phone
      number id and the message bill all belong to that gym. The config is
      loaded per send rather than read from the environment.
   ========================================================================= */

const GRAPH = "https://graph.facebook.com/v21.0";

export interface WhatsAppConfig {
  phoneNumberId: string;
  token: string;
}

export interface TemplateSend {
  /** Meta's approved template name, e.g. "expiry_7d". */
  name: string;
  language: string;
  /** Values for {{1}}, {{2}}, … in order. */
  params: string[];
}

export type SendResult =
  | { ok: true; providerMessageId: string }
  | { ok: false; error: string; retryable: boolean };

/** Meta wants a bare international number: no +, no spaces, no dashes. */
function normalise(phone: string): string {
  return phone.replace(/[^\d]/g, "");
}

/**
 * Which failures are worth another attempt.
 *
 * Retrying a 4xx burns the gym's quota to get the same answer — a template
 * that is not approved will not become approved because we asked twice. The
 * exceptions are 429 and 5xx, plus Meta's own transient codes.
 */
function isRetryable(status: number, code?: number): boolean {
  if (status === 429 || status >= 500) return true;
  // 131056 = pair rate limit, 130429 = throughput limit, 131048 = spam rate.
  return code === 131056 || code === 130429 || code === 131048;
}

export async function sendWhatsApp(
  config: WhatsAppConfig,
  toPhone: string | null,
  body: string,
  template: TemplateSend | null,
): Promise<SendResult> {
  if (!toPhone) {
    return { ok: false, error: "no phone number on member", retryable: false };
  }

  /* No approved template means the only legal send is free-form, which only
     works inside the 24-hour window. It is attempted rather than refused
     because it DOES work for a member who just messaged the gym — but the
     error, when it comes, should name the real cause. */
  const payload = template
    ? {
        messaging_product: "whatsapp",
        to: normalise(toPhone),
        type: "template",
        template: {
          name: template.name,
          language: { code: template.language },
          components: template.params.length
            ? [
                {
                  type: "body",
                  parameters: template.params.map((text) => ({ type: "text", text })),
                },
              ]
            : [],
        },
      }
    : {
        messaging_product: "whatsapp",
        to: normalise(toPhone),
        type: "text",
        text: { body },
      };

  try {
    const res = await fetch(`${GRAPH}/${config.phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${config.token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const json = (await res.json()) as {
      messages?: { id: string }[];
      error?: { message?: string; code?: number; error_data?: { details?: string } };
    };

    if (!res.ok) {
      const code = json.error?.code;
      const detail = json.error?.error_data?.details;
      /* The code is kept in the message deliberately: "Re-engagement message"
         means nothing to a gym owner, but 131047 is searchable and tells me
         instantly that a template is missing rather than a number being
         wrong. */
      const error = [json.error?.message ?? `HTTP ${res.status}`, detail, code && `(${code})`]
        .filter(Boolean)
        .join(" ");
      return { ok: false, error, retryable: isRetryable(res.status, code) };
    }

    return { ok: true, providerMessageId: json.messages?.[0]?.id ?? "unknown" };
  } catch (e) {
    // Network failure: always worth another go.
    return { ok: false, error: (e as Error).message, retryable: true };
  }
}

/** Used by the admin's "send a test" button and the connection check. */
export async function fetchPhoneNumber(
  config: WhatsAppConfig,
): Promise<{ ok: true; display: string; verified: string } | { ok: false; error: string }> {
  try {
    const res = await fetch(
      `${GRAPH}/${config.phoneNumberId}?fields=display_phone_number,verified_name,quality_rating`,
      { headers: { authorization: `Bearer ${config.token}` } },
    );
    const json = (await res.json()) as {
      display_phone_number?: string;
      verified_name?: string;
      error?: { message?: string; code?: number };
    };
    if (!res.ok) {
      return {
        ok: false,
        error: `${json.error?.message ?? `HTTP ${res.status}`}${
          json.error?.code ? ` (${json.error.code})` : ""
        }`,
      };
    }
    return {
      ok: true,
      display: json.display_phone_number ?? "unknown",
      verified: json.verified_name ?? "unverified",
    };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
