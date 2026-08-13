/* ============================================================================
   Shown the instant a nav item is tapped, while the page's queries run.

   Admin pages are force-dynamic and every one of them talks to Supabase, so
   a navigation takes the better part of a second on a desk and several on a
   phone. Without this file Next renders nothing at all until the server
   replies — the tap looks ignored, and people tap again.

   It also changes what the browser can do ahead of time: Next skips
   prefetching dynamic routes UNLESS the segment has a loading state, in
   which case it can prefetch the shell.

   The shapes deliberately match the real layout — a header, a row of stat
   tiles, two cards — so content lands in place instead of shoving the page
   around as it arrives.
   ========================================================================= */

function Bar({ w, h = "h-4" }: { w: string; h?: string }) {
  return <div className={`${h} ${w} animate-pulse rounded-sm bg-neutral-200`} />;
}

export default function AdminLoading() {
  return (
    <div aria-busy="true" aria-label="Loading">
      <header className="mb-7 space-y-2">
        <Bar w="w-24" h="h-3" />
        <Bar w="w-56" h="h-8" />
      </header>

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="space-y-2 rounded-md bg-surface p-4">
            <Bar w="w-12" h="h-7" />
            <Bar w="w-20" h="h-3" />
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {Array.from({ length: 2 }, (_, i) => (
          <div key={i} className="space-y-3 rounded-lg bg-surface p-5">
            <Bar w="w-28" h="h-3" />
            {Array.from({ length: 5 }, (_, j) => <Bar key={j} w="w-full" />)}
          </div>
        ))}
      </div>
    </div>
  );
}
