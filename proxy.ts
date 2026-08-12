import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { homeFor, surfaceFor, surfaceForPath } from "@/lib/auth/permissions";
import type { GymRole } from "@/lib/db/database.types";

/* ============================================================================
   Next 16 renamed the `middleware` convention to `proxy`; this file must
   export a function named `proxy`. It does two jobs on every request:

   1. Refreshes the Supabase session. Server Components cannot write cookies,
      so without this the access token silently expires and users get logged
      out mid-session.

   2. Keeps each role inside its own surface. This is convenience and clarity,
      NOT security — a member who forces their way to /admin still reads
      nothing, because RLS decides that, not this file. Never let a check here
      stand in for a policy.
   ========================================================================= */

const PUBLIC_PATHS = [
  "/",
  "/login",
  "/verify",
  "/set-password",
  "/welcome",
  "/auth/callback",
];

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.includes(pathname) || pathname.startsWith("/auth/");
}

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (toSet) => {
          for (const { name, value } of toSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of toSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  /* getClaims() verifies the JWT signature. getSession() only reads the
     cookie, so it must never be used for an authorisation decision. */
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims as Record<string, unknown> | undefined;
  const appMeta = (claims?.app_metadata ?? {}) as Record<string, unknown>;

  const signedIn = typeof claims?.sub === "string";
  const role = typeof appMeta.gym_role === "string"
    ? (appMeta.gym_role as GymRole)
    : null;

  const { pathname } = request.nextUrl;

  /* Signed out and asking for a protected surface → login, remembering where
     they were headed so they land there afterwards. */
  if (!signedIn && !isPublic(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (signedIn) {
    /* Signed in but the token carries no gym: either the access-token hook is
       not enabled, or their membership was revoked. Both mean "no access to
       anything", and both need a human, so send them somewhere that says so
       rather than looping through an empty dashboard. */
    if (!role && !isPublic(pathname)) {
      const url = request.nextUrl.clone();
      url.pathname = "/no-access";
      return NextResponse.redirect(url);
    }

    if (role) {
      const home = homeFor(role);

      // Already signed in — no reason to see the login screens again.
      if (pathname === "/login" || pathname === "/verify" || pathname === "/") {
        const url = request.nextUrl.clone();
        url.pathname = home;
        url.search = "";
        return NextResponse.redirect(url);
      }

      // Wrong surface for this role → their own home.
      const wanted = surfaceForPath(pathname);
      if (wanted && wanted !== surfaceFor(role)) {
        const url = request.nextUrl.clone();
        url.pathname = home;
        url.search = "";
        return NextResponse.redirect(url);
      }
    }
  }

  return response;
}

export const config = {
  matcher: [
    /* Everything except static assets and image files. The negative lookahead
       keeps the proxy off the hot path for the member app's icons and the
       service worker, which must be cacheable. */
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp|woff2?)$).*)",
  ],
};
