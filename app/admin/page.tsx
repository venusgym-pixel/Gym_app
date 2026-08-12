import { requireActor } from "@/lib/db/server";

/* Placeholder home for the Admin surface. Replaced in M2/M3 by the real
   dashboard; exists now so role routing in proxy.ts has a destination. */
export default async function AdminHome() {
  const actor = await requireActor();
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center gap-3 px-6">
      <p className="font-mono text-[11px] tracking-[0.12em] text-neutral-600">
        ADMIN · Run the gym
      </p>
      <h1 className="text-4xl">Signed in</h1>
      <p className="text-sm text-neutral-700">
        Role <strong>{actor.role}</strong> · gym <code>{actor.gymId.slice(0, 8)}</code>
      </p>
    </main>
  );
}
