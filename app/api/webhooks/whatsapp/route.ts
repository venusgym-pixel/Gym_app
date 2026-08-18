import { NextResponse, type NextRequest } from "next/server";
import { unsafeAcrossAllGyms } from "@/lib/db/admin";

/* ============================================================================
   Meta's WhatsApp webhook: delivery receipts and inbound messages.

   Why it matters: without it the delivery log stops at "sent", which only
   means Meta accepted the message. Whether it reached the phone, was read, or
   bounced because the number has no WhatsApp account is exactly what a gym
   owner asks when a member says nobody told them — and that answer only
   arrives here.

   No user session: Meta is calling. Requests are identified by the
   phone_number_id in the payload, which maps back to one gym's config, and
   authenticated by the verify token on subscription plus the X-Hub-Signature
   on delivery. The route sits under /api, which the proxy deliberately skips
   — a 307 to /login here would silently discard every receipt.
   ========================================================================= */

export const dynamic = "force-dynamic";

/* ── subscription handshake ─────────────────────────────────────────────── */

/**
 * Meta calls this once, when the webhook URL is saved, and expects the
 * challenge echoed back verbatim.
 *
 * The token is matched against whatsapp_configs rather than a platform-wide
 * env var, because each gym subscribes its own WABA and picks its own token.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const mode = params.get("hub.mode");
  const token = params.get("hub.verify_token");
  const challenge = params.get("hub.challenge");

  if (mode !== "subscribe" || !token || !challenge) {
    return new NextResponse("bad request", { status: 400 });
  }

  const db = unsafeAcrossAllGyms("webhook");
  const { data } = await db
    .from("whatsapp_configs")
    .select("gym_id")
    .eq("verify_token", token)
    .maybeSingle();

  if (!data) return new NextResponse("forbidden", { status: 403 });

  // Plain text, not JSON — Meta compares the body byte for byte.
  return new NextResponse(challenge, {
    status: 200,
    headers: { "content-type": "text/plain" },
  });
}

/* ── receipts ───────────────────────────────────────────────────────────── */

interface Status {
  id: string;
  status: "sent" | "delivered" | "read" | "failed";
  timestamp?: string;
  errors?: { code?: number; title?: string; message?: string }[];
}

/**
 * Meta signs every POST with an HMAC of the raw body under the App Secret.
 *
 * Without checking it this endpoint is an unauthenticated write: anyone who
 * learns the URL could mark messages delivered, or mark them failed and have
 * the gym chase members who were never contacted. The message id is not a
 * secret — it appears in the delivery log.
 *
 * Unset secret means CLOSED, matching the cron endpoints. An unverifiable
 * mutation is worse than a missing receipt.
 */
async function signed(raw: string, header: string | null): Promise<boolean> {
  const secret = process.env.META_APP_SECRET;
  if (!secret || !header?.startsWith("sha256=")) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(raw));
  const expected = [...new Uint8Array(mac)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  const given = header.slice("sha256=".length);
  if (given.length !== expected.length) return false;

  // Constant time: a length-safe compare that does not bail on first mismatch.
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ given.charCodeAt(i);
  }
  return diff === 0;
}

export async function POST(request: NextRequest) {
  /* Raw text first — the signature covers the exact bytes, so parsing and
     re-serialising would produce a different digest. */
  const raw = await request.text();

  if (!(await signed(raw, request.headers.get("x-hub-signature-256")))) {
    console.warn("[whatsapp:webhook] rejected an unsigned or mis-signed request");
    return new NextResponse("forbidden", { status: 403 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: true }); // malformed: do not make Meta retry
  }

  const entries =
    (payload as { entry?: { changes?: { value?: Record<string, unknown> }[] }[] }).entry ?? [];

  const db = unsafeAcrossAllGyms("webhook");
  let handled = 0;

  for (const entry of entries) {
    for (const change of entry.changes ?? []) {
      const value = change.value ?? {};
      const statuses = (value.statuses ?? []) as Status[];

      for (const s of statuses) {
        /* Matched on the provider's message id, which the drain recorded when
           Meta accepted the send. A receipt for anything else — a message
           sent from Meta's own console, say — simply matches nothing. */
        const patch: Record<string, unknown> = { status: s.status };

        if (s.status === "delivered") patch.delivered_at = new Date().toISOString();
        if (s.status === "failed") {
          const e = s.errors?.[0];
          patch.error = [e?.title, e?.message, e?.code && `(${e.code})`]
            .filter(Boolean)
            .join(" ") || "failed at Meta";
        }

        const { error } = await db
          .from("notification_outbox")
          .update(patch)
          .eq("provider_message_id", s.id);

        if (!error) handled++;
      }
    }
  }

  /* Always 200. Meta retries anything else for days, and a receipt we cannot
     match is not a failure worth being retried at us. */
  return NextResponse.json({ ok: true, handled });
}
