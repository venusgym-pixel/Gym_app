import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createServerDb, currentActor } from "@/lib/db/server";
import { withGymScope } from "@/lib/db/admin";
import { offlineCheckinIsFresh, verifyKioskToken } from "@/lib/qr";

/* ============================================================================
   POST /api/checkin  —  the member scans the kiosk QR.

   A Route Handler rather than a Server Action, deliberately: per ADR-2 the
   member surface must stay callable from React Native if this ever ships as
   an Expo app, and Server Actions cannot be.

   Three things are established before anything is written:
     1. WHO   — from the caller's verified session, never from the request body
     2. WHERE — from the kiosk token's HMAC, which proves a live gym screen
     3. WHETHER — record_checkin decides, and it alone knows the rules
   ========================================================================= */

export const dynamic = "force-dynamic";

const Body = z.object({
  token: z.string().min(1).max(300),
  /** Client-generated, so a queued offline scan syncing twice is one visit. */
  idempotencyKey: z.uuid().optional(),
  /** When the scan actually happened; may be minutes ago in a basement gym. */
  scannedAt: z.number().int().positive().optional(),
});

export async function POST(request: NextRequest) {
  const actor = await currentActor();
  if (!actor) {
    return NextResponse.json({ outcome: "unauthenticated" }, { status: 401 });
  }

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ outcome: "bad-request" }, { status: 400 });
  }
  const { token, idempotencyKey, scannedAt } = parsed.data;

  /* A queued scan from this morning is fine; one replayed tomorrow is not. */
  if (scannedAt !== undefined && !offlineCheckinIsFresh(scannedAt)) {
    return NextResponse.json({ outcome: "stale-scan" }, { status: 409 });
  }

  /* The kiosk secret is not readable by a member, so the lookup runs with the
     service role — scoped to the caller's own gym, which is the only gym the
     token is allowed to belong to. */
  const verdict = await withGymScope("webhook", actor.gymId, async (db, gymId) =>
    verifyKioskToken(
      token,
      async (tokenGymId, kioskId) => {
        if (tokenGymId !== gymId) return null;
        const { data } = await db
          .from("kiosk_devices")
          .select("secret")
          .eq("gym_id", gymId)
          .eq("id", kioskId)
          .eq("is_active", true)
          .maybeSingle();
        return (data as { secret: string } | null)?.secret ?? null;
      },
      { expectedGymId: gymId },
    ),
  );

  if (!verdict.ok) {
    return NextResponse.json({ outcome: "invalid-code", reason: verdict.reason },
                             { status: 400 });
  }

  /* From here the caller's own session does the work, so RLS applies and a
     member can only ever check themselves in. */
  const db = await createServerDb();

  const { data: member } = await db
    .from("members")
    .select("id")
    .eq("gym_id", actor.gymId)
    .eq("user_id", actor.userId)
    .maybeSingle();

  if (!member) {
    return NextResponse.json({ outcome: "not-a-member" }, { status: 403 });
  }

  const { data, error } = await db.rpc("record_checkin", {
    p_gym_id: actor.gymId,
    p_member_id: (member as { id: string }).id,
    p_method: "qr",
    p_idempotency_key: idempotencyKey ?? null,
  });

  if (error) {
    console.error("[checkin] record_checkin failed", error);
    return NextResponse.json({ outcome: "error" }, { status: 500 });
  }

  const row = Array.isArray(data) ? data[0] : data;

  /* 'expired' and 'frozen' are 200, not errors: the app has a screen for each
     (M-10 renew, and the frozen variant), and treating them as failures would
     surface a generic error toast instead. */
  return NextResponse.json({
    outcome: row?.outcome ?? "none",
    memberName: row?.member_name ?? null,
    status: row?.status ?? null,
    expiresOn: row?.expires_on ?? null,
    daysLeft: row?.days_left ?? null,
    streak: row?.streak ?? 0,
    visitsThisMonth: row?.visits_this_month ?? 0,
  });
}
