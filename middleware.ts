import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { homeFor, mayOpen, surfaceForPath } from "@/lib/auth/permissions";
import type { GymRole } from "@/lib/db/database.types";

/* ============================================================================
   Deliberately middleware.ts, and NOT Next 16's proxy.ts.

   Next 16 renamed the convention and pinned it to the Node runtime — the
   build rejects route segment config there with "Proxy always runs on
   Node.js runtime". Cloudflare Workers cannot run Node middleware, so the
   OpenNext build fails outright: "Node.js middleware is not currently
   supported" (opennextjs-cloudflare#962).

   middleware.ts still works in Next 16 — it emits a deprecation warning and
   nothing more — runs on the edge, and is what the adapter supports. Rename
   it back to proxy.ts once OpenNext lands Node middleware support.

   Nothing in here needs Node: @supabase/ssr is edge-compatible and
   getClaims() verifies the JWT with WebCrypto.

   It does two jobs on every request:

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
  /* Claiming app access happens BEFORE the member has an account, so this
     cannot require one. The code in the URL is the credential, and it is
     short-lived, single-use and checked against the last four digits of
     their number. */
  "/join",
  "/forgot",
  "/auth/callback",
];

function isPublic(pathname: string): boolean {
  return (
    PUBLIC_PATHS.includes(pathname) ||
    pathname.startsWith("/auth/") ||
    pathname.startsWith("/join/")
  );
}

export async function middleware(request: NextRequest) {
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

      /* A surface this role has no business in → their own home.
         mayOpen(), not surfaceFor(): owners and managers land on /admin but
         legitimately supervise coaching, so bouncing them out of /trainer
         would make the product feel like it is hiding things from the person
         who owns it. */
      const wanted = surfaceForPath(pathname);
      if (wanted && !mayOpen(role, wanted)) {
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
    /*
      Everything except static assets, image files — and /api.

      /api is excluded deliberately, not as an optimisation. This proxy
      redirects unauthenticated requests to /login, which is right for a page
      and catastrophic for an endpoint: pg_cron POSTing to /api/jobs/daily
      with a valid x-cron-secret would receive a 307 to an HTML login page,
      the job would never run, and the logs would show redirects rather than
      failures. The whole reminder engine would go quiet without an error.

      Every route under /api authenticates itself — the job endpoints on the
      shared secret, /api/checkin and /api/qr on the caller's session — so
      nothing is lost by skipping them here.
    */
    /* .html is in the list because a static file under public/ is otherwise
       matched like a page and redirected to /login — which made the viewport
       diagnostic unreachable on the one device that needed it. No app route
       ends in .html; every page is a Next route. */
    "/((?!api|_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|.*\\.(?:html|svg|png|jpg|jpeg|gif|webp|woff2?)$).*)",
  ],
};
