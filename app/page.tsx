import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentActor } from "@/lib/db/server";
import { homeFor } from "@/lib/auth/permissions";
import type { GymRole } from "@/lib/db/database.types";
import { Landing } from "@/components/site/landing";
import { site } from "@/lib/site-content";

/* ============================================================================
   S-01 · "/" — the gym's public landing page, or the way home.

   Signed-in users never see it: middleware already redirects them to their
   surface, and this repeats the check server-side rather than trusting the
   proxy hop. Signed-out visitors get the landing page, which links to
   /login for members.

   The installed member app is unaffected — the manifest's start_url is /m,
   so a signed-out member opening it still lands on login, not marketing.
   ========================================================================= */

export const metadata: Metadata = {
  title: { absolute: `${site.name} · Gym in ${site.area}, ${site.city}` },
  description: `${site.name} — coached strength, fat-loss and personal training in ${site.area}, ${site.city}. Book a free trial.`,
  openGraph: {
    title: `${site.name} · ${site.area}`,
    description: "Coached programs, serious equipment and a member app. Your first session is free.",
    type: "website",
    locale: "en_IN",
  },
};

export default async function HomePage() {
  const actor = await currentActor();
  if (actor) redirect(homeFor(actor.role as GymRole));

  return <Landing />;
}
