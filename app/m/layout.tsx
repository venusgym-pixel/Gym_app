import { MemberTabBar } from "@/components/member/nav";

/* ============================================================================
   The member shell.

   This did not exist, and its absence was the whole of why the member surface
   felt slow while the admin one did not. Every page under /m is
   force-dynamic and each rendered its own copy of the tab bar as a server
   component, so a tab tap had nothing to show until a full server round trip
   came back: no active-state change, no skeleton, nothing. Admin had a layout
   and a loading boundary and so felt immediate on the same connection.

   With the bar hoisted here it is mounted once and survives navigation, and
   the sibling loading.tsx gives Next something to prefetch and something to
   paint the instant a tab is tapped.
   ========================================================================= */

export default function MemberLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <MemberTabBar />
    </>
  );
}
