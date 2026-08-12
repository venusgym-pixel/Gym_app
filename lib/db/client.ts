"use client";

import { createBrowserClient } from "@supabase/ssr";
import { env } from "./env";

/* ============================================================================
   Browser client — the member app's primary data path (ADR-2).

   Deliberately NOT Server Actions: those are a Next.js-only RPC that React
   Native cannot call. Every member read and write goes through this client, so
   the same data layer works unchanged if the PWA is later wrapped in Expo.
   Privileged operations that must not be client-driven (checkout, QR
   validation, check-in) go to Route Handlers instead.

   Safe in the browser: this uses the anon key, and RLS decides what it can see.
   ========================================================================= */

let cached: ReturnType<typeof createBrowserClient> | null = null;

export function createBrowserDb() {
  cached ??= createBrowserClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
  return cached;
}
