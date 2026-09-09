import "server-only";

import { cache } from "react";
import { createServerDb, requireActor } from "@/lib/db/server";

/* ============================================================================
   Does this gym charge GST?

   It cannot live in the JWT next to gym_id and role: an owner who turns the
   toggle off expects the next price they look at to have changed, not the one
   after their token refreshes.

   So it is a query — wrapped in React's cache() so the four screens that ask
   during one render share a single round trip. Pages that already fetch the
   gyms row read the column from there instead; this is for the ones that
   don't, and it belongs in their existing Promise.all so it costs no
   additional wait.
   ========================================================================= */

export const gstEnabled = cache(async (): Promise<boolean> => {
  const actor = await requireActor();
  const db = await createServerDb();

  const { data } = await db
    .from("gyms")
    .select("gst_enabled")
    .eq("id", actor.gymId)
    .maybeSingle();

  /* Registered is the assumption when the row cannot be read: showing tax that
     is not charged is a correctable surprise at the desk, whereas omitting tax
     that is owed is money the gym has to find later out of its own pocket. */
  return (data as { gst_enabled: boolean } | null)?.gst_enabled ?? true;
});
