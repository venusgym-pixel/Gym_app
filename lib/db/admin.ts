import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env, serviceRoleKey } from "./env";

/* ============================================================================
   THE ONLY PLACE IN THIS CODEBASE THAT MAY CONSTRUCT A SERVICE-ROLE CLIENT.
   ============================================================================

   The service role bypasses row-level security completely. One query written
   against it "just to make this work" is a cross-tenant data leak — the top
   risk on this project, and a reportable DPDP breach.

   `npm run guard:service-role` fails the build if SUPABASE_SERVICE_ROLE_KEY or
   createClient-with-service-role appears anywhere but this file. Do not add an
   exception; add a policy instead.

   Legitimate uses, and there are only these:
     · gym onboarding, before the first gym_users row exists to grant anything
     · staff invitation, which creates an auth.users row — a schema no policy
       can reach, since RLS governs the public schema and not Supabase Auth
     · the pg_cron worker draining notification_outbox across all tenants
     · webhook handlers, which arrive with no user session at all
     · DPDP erasure, which must reach rows the requester can no longer read

   Every one of those must call withGymScope() so the tenant filter is applied
   in application code, since the database will not apply it for them.
   ========================================================================= */

let cached: SupabaseClient | null = null;

function adminClient(): SupabaseClient {
  if (!cached) {
    cached = createClient(env.NEXT_PUBLIC_SUPABASE_URL, serviceRoleKey(), {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { "x-client-info": "fitwell-admin" } },
    });
  }
  return cached;
}

/** Why this call needs to bypass RLS. Recorded on every use so an auditor can
 *  see the reason without reading the surrounding code. */
export type BypassReason =
  | "gym-onboarding"
  | "staff-invite"
  | "cron-worker"
  | "webhook"
  | "dpdp-erasure";

/**
 * Run privileged work against an explicit gym, with the reason stated.
 *
 * The callback receives the service-role client AND the gym id it is scoped
 * to. Every query inside MUST filter on that gym id — nothing else will.
 *
 * @example
 * await withGymScope("cron-worker", gymId, (db, gym) =>
 *   db.from("notification_outbox").select("*").eq("gym_id", gym).eq("status", "queued"),
 * );
 */
export async function withGymScope<T>(
  reason: BypassReason,
  gymId: string,
  fn: (db: SupabaseClient, gymId: string) => Promise<T>,
): Promise<T> {
  if (!gymId) {
    throw new Error(
      `withGymScope("${reason}") called without a gym id. Privileged queries ` +
        `must always name their tenant explicitly.`,
    );
  }
  return fn(adminClient(), gymId);
}

/**
 * Cross-tenant privileged access — deliberately awkward to call.
 *
 * Only for work that is genuinely platform-wide: the cron fan-out that decides
 * which gyms have reminders due, and platform onboarding. If you are reaching
 * for this to serve a user request, you want a policy, not this function.
 */
export function unsafeAcrossAllGyms(
  reason: Extract<BypassReason, "cron-worker" | "gym-onboarding">,
): SupabaseClient {
  void reason;
  return adminClient();
}
