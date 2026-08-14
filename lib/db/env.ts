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

const parsed = publicEnv.safeParse({
  /* Referenced as full literals, not via a loop — Next inlines
     NEXT_PUBLIC_* at build time only when it can see the whole expression. */
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
});

if (!parsed.success) {
  /* This module is imported while Next collects page data, so a miss here
     fails the BUILD, not a request — and the default Zod dump does not say
     that, which sent us looking in the wrong place once already.

     The distinction that matters on Cloudflare: `wrangler secret put` and
     `secret bulk` set RUNTIME secrets, which a build cannot see. NEXT_PUBLIC_*
     values are inlined into the browser bundle while building, so they must
     also exist as BUILD variables — in the Workers/Pages project under
     Settings → Build → Variables and secrets. Locally that job is done by
     .env.local, which is why this never fails on your own machine. */
  const missing = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
  throw new Error(
    `Missing or invalid environment variables: ${missing}.\n\n` +
      `These are needed at BUILD time — they are inlined into the browser ` +
      `bundle — not only at runtime. A Cloudflare runtime secret is not ` +
      `enough:\n` +
      `  · locally  → .env.local\n` +
      `  · Cloudflare → Settings → Build → Variables and secrets\n` +
      `  · the worker's runtime → wrangler secret bulk .dev.vars\n\n` +
      `See docs/SETUP.md §7.`,
  );
}

export const env = parsed.data;

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
