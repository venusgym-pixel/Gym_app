import { Screen } from "@/components/ui/primitives";

/* ============================================================================
   Painted the instant a member taps a tab, while the page's queries run.

   Two jobs. The obvious one is that something appears immediately instead of
   the tap looking ignored for a second or two — which is when people tap
   again, and end up somewhere they did not choose.

   The less obvious one is prefetching: Next will not prefetch a dynamic route
   unless its segment has a loading state, and every page under /m is
   force-dynamic. Without this file the tab bar's Links prefetched nothing, so
   every tap started from cold.

   Sized in em like the rest of the member surface, so the skeleton scales with
   the same fluid type scale as the content that replaces it.
   ========================================================================= */

function Block({ h, w = "100%" }: { h: string; w?: string }) {
  return (
    <div
      className="animate-pulse rounded-md"
      style={{ height: h, width: w, background: "var(--color-app-surface)" }}
    />
  );
}

export default function MemberLoading() {
  return (
    <Screen tabBar className="gap-3.5">
      <div aria-busy="true" aria-label="Loading" className="flex flex-col gap-3.5">
        {/* Greeting line, then the shapes the member screens actually open
            with: one wide card and a grid of tiles. */}
        <Block h="1.1em" w="40%" />
        <Block h="1.9em" w="65%" />
        <Block h="7.5em" />
        <div className="grid grid-cols-2 gap-3.5">
          <Block h="5em" />
          <Block h="5em" />
        </div>
        <Block h="4em" />
      </div>
    </Screen>
  );
}
