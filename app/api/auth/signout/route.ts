import { NextResponse, type NextRequest } from "next/server";
import { createServerDb } from "@/lib/db/server";

/* ============================================================================
   POST /api/auth/signout

   A Route Handler rather than a Server Action, for two reasons:

     · Server Actions are a Next.js-only RPC, and per ADR-2 anything the
       member surface calls has to stay reachable from React Native later.
     · A plain <form method="post"> hits this with no JavaScript at all, so
       signing out still works if hydration failed — which is exactly when
       someone most wants to get out.

   POST, not GET: a link that logs you out can be triggered by a prefetch or
   an <img> tag on another site.
   ========================================================================= */

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const db = await createServerDb();

  /* Revokes the refresh token server-side and clears the auth cookies.
     'local' scope only signs out this browser — signing a receptionist out
     of the front desk should not kick them off their phone too. */
  await db.auth.signOut({ scope: "local" });

  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";

  /* 303 so the browser follows with a GET; a 307 would re-POST to /login. */
  return NextResponse.redirect(url, { status: 303 });
}
