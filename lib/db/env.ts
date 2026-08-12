import { z } from "zod";

/* ============================================================================
   Environment, validated once at import. Fail loudly at boot rather than
   handing `undefined` to the Supabase client and getting an opaque 401 an hour
   later in production.
   ========================================================================= */

const publicEnv = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20),
});

export const env = publicEnv.parse({
  /* Referenced as full literals, not via a loop — Next inlines
     NEXT_PUBLIC_* at build time only when it can see the whole expression. */
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
});

/** Server-only secret. Never import this from a Client Component. */
export function serviceRoleKey(): string {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not set. It is required only by " +
        "lib/db/admin.ts; if you are seeing this in a request path, " +
        "something is using the admin client that should not be.",
    );
  }
  return key;
}
