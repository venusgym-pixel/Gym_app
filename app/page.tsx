/* Placeholder root. Replaced in M1 by a router that sends each signed-in user
   to their role's home: /admin, /trainer or /m. */
export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center gap-8 px-6 py-16">
      <div>
        <p className="font-mono text-[11px] tracking-[0.12em] text-neutral-600">
          FITWELL · MULTI-TENANT GYM PLATFORM
        </p>
        <h1 className="mt-2 text-4xl">Foundation</h1>
        <p className="mt-3 max-w-md text-sm text-neutral-700">
          Next.js 16, Tailwind v4 and the Organic design tokens are wired up.
          Roles, schema and row-level security land next.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {(
          [
            ["Active", "bg-status-active"],
            ["Expiring", "bg-status-expiring"],
            ["Expired", "bg-status-expired"],
            ["Frozen", "bg-status-frozen"],
            ["Trial", "bg-status-trial"],
            ["Cancelled", "bg-status-cancelled"],
          ] as const
        ).map(([label, bg]) => (
          <span
            key={label}
            className={`${bg} rounded-pill px-3 py-1 text-[11px] font-semibold text-neutral-900`}
          >
            {label}
          </span>
        ))}
      </div>

      <div className="surface-app rounded-lg p-6">
        <p className="text-[11px] tracking-[0.08em] text-app-good uppercase">
          Member surface
        </p>
        <p className="mt-2 text-2xl">Chest + Triceps</p>
        <button
          type="button"
          className="mt-4 w-full rounded-pill bg-app-accent px-4 py-3 font-semibold text-app-accent-ink"
        >
          Start workout
        </button>
      </div>
    </main>
  );
}
