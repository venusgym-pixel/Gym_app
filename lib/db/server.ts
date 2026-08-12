import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { env } from "./env";

/* ============================================================================
   Request-scoped client for Server Components, Server Actions and Route
   Handlers. Carries the caller's session, so every query runs under RLS with
   their gym_id and role — which is what makes tenant isolation automatic
   rather than something each query has to remember.

   Per ADR-2, admin and trainer surfaces use this freely. The member surface
   talks to Supabase from the browser instead, so that code stays portable to
   Expo later.
   ========================================================================= */

export async function createServerDb() {
  const store = await cookies();

  return createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return store.getAll();
        },
        setAll(toSet) {
          try {
            for (const { name, value, options } of toSet) {
              store.set(name, value, options);
            }
          } catch {
            /* Called from a Server Component, where cookies are read-only.
               Harmless: middleware refreshes the session on the next request. */
          }
        },
      },
    },
  );
}

/* ── session helpers ──────────────────────────────────────────────────────── */

export interface Actor {
  userId: string;
  gymId: string;
  role: string;
}

/**
 * The signed-in user's identity and tenant, read from the verified JWT claims
 * that the custom access token hook stamped.
 *
 * Returns null when signed out, or when the user has no active gym membership
 * — a revoked trainer keeps a valid token until it expires, but the hook stops
 * stamping a gym, so they resolve to null here and to zero rows in the database.
 */
export async function currentActor(): Promise<Actor | null> {
  const db = await createServerDb();

  /* getClaims() verifies the JWT signature. Never trust getSession() for
     authorisation — it reads the cookie without verifying it. */
  const { data, error } = await db.auth.getClaims();
  if (error || !data?.claims) return null;

  const claims = data.claims as Record<string, unknown>;
  const appMeta = (claims.app_metadata ?? {}) as Record<string, unknown>;

  const userId = typeof claims.sub === "string" ? claims.sub : null;
  const gymId = typeof appMeta.gym_id === "string" ? appMeta.gym_id : null;
  const role = typeof appMeta.gym_role === "string" ? appMeta.gym_role : null;

  if (!userId || !gymId || !role) return null;
  return { userId, gymId, role };
}

/** Same, but throws — for routes that have already been gated by middleware. */
export async function requireActor(): Promise<Actor> {
  const actor = await currentActor();
  if (!actor) throw new Error("Not authenticated, or no active gym membership");
  return actor;
}
