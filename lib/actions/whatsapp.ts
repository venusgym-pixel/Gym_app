"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createServerDb, requireActor } from "@/lib/db/server";
import { withGymScope } from "@/lib/db/admin";
import { can } from "@/lib/auth/permissions";
import { fetchPhoneNumber, sendWhatsApp } from "@/lib/channels/whatsapp";
import type { GymRole } from "@/lib/db/database.types";
import type { ActionResult } from "./members";

/* ============================================================================
   A-43 · Connect WhatsApp, from the admin screen.

   Per gym, not per platform: under Meta's Tech Provider model each gym has
   its own WhatsApp Business Account, its own token and its own message bill.

   The token is written straight into Vault by set_whatsapp_token() and never
   comes back — there is no read path for an authenticated session, only for
   the cron worker at send time. So the form can save a token and can never
   show one, which is why it renders as "saved" rather than as a value.
   ========================================================================= */


/**
 * Read a gym's WhatsApp credentials for a server-side operation.
 *
 * Via the service role, never a SQL function granted to `authenticated`.
 * The token can send messages billed to the gym, so no browser session gets
 * a read path to it at all; permission is checked in the caller above.
 */
async function credentials(
  gymId: string,
): Promise<{ phoneNumberId: string; token: string } | null> {
  return withGymScope("whatsapp-test", gymId, async (db, gym) => {
    const { data: cfg } = await db
      .from("whatsapp_configs")
      .select("phone_number_id, token_secret_id")
      .eq("gym_id", gym)
      .maybeSingle();

    const row = cfg as { phone_number_id: string; token_secret_id: string | null } | null;
    if (!row?.token_secret_id) return null;

    const { data: secret } = await db
      .schema("vault")
      .from("decrypted_secrets")
      .select("decrypted_secret")
      .eq("id", row.token_secret_id)
      .maybeSingle();

    const token = (secret as { decrypted_secret: string } | null)?.decrypted_secret;
    return token ? { phoneNumberId: row.phone_number_id, token } : null;
  });
}

const Config = z.object({
  phone_number_id: z.string().trim().regex(/^\d{5,}$/, "Phone number ID is the long number from Meta"),
  waba_id: z.string().trim().optional(),
  /* Optional on save: an owner correcting the phone number id should not have
     to paste a 200-character token again. */
  token: z.string().trim().optional(),
  verify_token: z.string().trim().optional(),
});

export async function saveWhatsAppConfig(
  _prev: ActionResult | null,
  form: FormData,
): Promise<ActionResult> {
  const actor = await requireActor();
  if (!can(actor.role as GymRole, "settings", "edit")) {
    return { ok: false, error: "Only an owner can connect WhatsApp." };
  }

  const parsed = Config.safeParse(Object.fromEntries(form));
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form." };
  }
  const v = parsed.data;

  const db = await createServerDb();

  const { error } = await db.from("whatsapp_configs").upsert(
    {
      gym_id: actor.gymId,
      phone_number_id: v.phone_number_id,
      waba_id: v.waba_id || null,
      verify_token: v.verify_token || null,
    },
    { onConflict: "gym_id" },
  );
  if (error) return { ok: false, error: "Could not save. Try again." };

  if (v.token) {
    const { error: tokenError } = await db.rpc("set_whatsapp_token", {
      p_gym_id: actor.gymId,
      p_token: v.token,
    });
    if (tokenError) {
      return { ok: false, error: "Saved the ids, but the token was rejected." };
    }
  }

  revalidatePath("/admin/settings");
  return {
    ok: true,
    message: v.token
      ? "Saved. Run the connection test to confirm Meta accepts it."
      : "Saved. The existing token was left untouched.",
  };
}

/**
 * Ask Meta who this number is.
 *
 * Cheaper and safer than sending a message: it needs no template, costs
 * nothing, and proves the token, the phone number id and the permissions all
 * line up. A gym owner who has pasted the wrong id finds out here rather than
 * from a reminder that silently never arrives.
 */
export async function testWhatsAppConnection(): Promise<ActionResult> {
  const actor = await requireActor();
  if (!can(actor.role as GymRole, "settings", "edit")) {
    return { ok: false, error: "Only an owner can test the connection." };
  }

  const cfg = await credentials(actor.gymId);
  if (!cfg) {
    return { ok: false, error: "No access token saved yet. Paste one and save." };
  }

  const result = await fetchPhoneNumber(cfg);

  const db = await createServerDb();
  await db
    .from("whatsapp_configs")
    .update({
      last_checked_at: new Date().toISOString(),
      last_error: result.ok ? null : result.error,
      last_ok_at: result.ok ? new Date().toISOString() : undefined,
      display_number: result.ok ? result.display : undefined,
    })
    .eq("gym_id", actor.gymId);

  revalidatePath("/admin/settings");

  return result.ok
    ? { ok: true, message: `Connected to ${result.display} (${result.verified}).` }
    : { ok: false, error: result.error };
}

/** Send one real message, to prove delivery rather than just credentials. */
export async function sendWhatsAppTest(
  _prev: ActionResult | null,
  form: FormData,
): Promise<ActionResult> {
  const actor = await requireActor();
  if (!can(actor.role as GymRole, "settings", "edit")) {
    return { ok: false, error: "Only an owner can send a test." };
  }

  const phone = String(form.get("phone") ?? "").trim();
  const templateName = String(form.get("template") ?? "").trim();
  if (!/^\d{10,15}$/.test(phone.replace(/\D/g, ""))) {
    return { ok: false, error: "Enter the number with country code, e.g. 919845012345." };
  }

  const cfg = await credentials(actor.gymId);
  if (!cfg) return { ok: false, error: "Connect WhatsApp first." };

  const result = await sendWhatsApp(
    cfg,
    phone,
    "Test message from Fitwell.",
    /* Meta's own hello_world template exists on every new WABA, which makes
       it the one thing guaranteed to be sendable before the gym's own
       templates are approved. */
    templateName
      ? { name: templateName, language: "en_US", params: [] }
      : { name: "hello_world", language: "en_US", params: [] },
  );

  return result.ok
    ? { ok: true, message: `Sent. Check the phone — message id ${result.providerMessageId}.` }
    : { ok: false, error: result.error };
}
