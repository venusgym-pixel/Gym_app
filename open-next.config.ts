import { defineCloudflareConfig } from "@opennextjs/cloudflare";

/* ============================================================================
   OpenNext → Cloudflare Workers.

   Why we moved off Netlify: measured from Bengaluru, a 38KB immutable asset
   took 680-1140ms and reported Cache-Status: fwd=miss on every request — the
   edge never served it from cache, so every byte round-tripped to a US
   origin. The functions ran there too, so each Supabase query crossed to
   Mumbai and back. Cloudflare answers from an Indian PoP in ~300ms and runs
   the worker at the same edge.

   No incremental cache is configured. Every page in this app is
   force-dynamic — a gym's attendance and payments are wrong the moment they
   are cached — so there is nothing for an ISR cache to hold, and adding a KV
   binding for it would be cost and configuration for no effect.
   ========================================================================= */

export default defineCloudflareConfig();
