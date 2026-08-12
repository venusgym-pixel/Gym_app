import { redirect } from "next/navigation";
import { currentActor } from "@/lib/db/server";
import { homeFor } from "@/lib/auth/permissions";
import type { GymRole } from "@/lib/db/database.types";
import { Logo, Screen } from "@/components/ui/primitives";

/* ============================================================================
   S-01 · Splash / session restore

   The only job of "/" is to work out where the caller belongs and send them
   there. Middleware already redirects signed-in users, so this mostly renders
   for signed-out visitors on the way to /login — but it repeats the check
   server-side rather than trusting the proxy hop.
   ========================================================================= */

export default async function SplashPage() {
  const actor = await currentActor();

  if (actor) redirect(homeFor(actor.role as GymRole));
  redirect("/login");

  /* Unreachable, but it is what a slow session restore would paint. */
  return (
    <Screen center>
      <Logo size={104} />
      <div className="mt-6">
        <h1 className="text-[30px]">Fitwell</h1>
        <p className="mt-1 text-[13px]" style={{ color: "var(--app-ink-55)" }}>
          Koramangala · Bengaluru
        </p>
      </div>
    </Screen>
  );
}
