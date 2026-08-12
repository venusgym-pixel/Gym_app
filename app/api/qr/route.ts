import { NextResponse } from "next/server";
import { requireActor } from "@/lib/db/server";
import { withGymScope } from "@/lib/db/admin";
import { makeKioskToken, QR_WINDOW_SECONDS } from "@/lib/qr";

/* ============================================================================
   GET /api/qr  —  the token the kiosk screen renders (K-01).

   Polled by the kiosk every window. Staff-only: a member who could mint kiosk
   tokens could check in from home, which is precisely what the rotating token
   exists to prevent.

   The secret never leaves the server; only the derived token does.
   ========================================================================= */

export const dynamic = "force-dynamic";

export async function GET() {
  const actor = await requireActor().catch(() => null);
  if (!actor) return NextResponse.json({ error: "unauthorised" }, { status: 401 });

  if (!["owner", "manager", "receptionist"].includes(actor.role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const result = await withGymScope("webhook", actor.gymId, async (db, gymId) => {
    let { data: kiosk } = await db
      .from("kiosk_devices")
      .select("id, secret")
      .eq("gym_id", gymId)
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();

    // First run at a new gym: create the default counter kiosk rather than
    // making the owner find a settings screen before they can open the doors.
    if (!kiosk) {
      const { data: created, error } = await db
        .from("kiosk_devices")
        .insert({ gym_id: gymId, name: "Reception" })
        .select("id, secret")
        .single();
      if (error) throw new Error(error.message);
      kiosk = created;
    }

    const { id, secret } = kiosk as { id: string; secret: string };
    return { token: await makeKioskToken(secret, gymId, id), kioskId: id };
  });

  return NextResponse.json(
    { ...result, refreshInSeconds: QR_WINDOW_SECONDS },
    { headers: { "cache-control": "no-store" } },
  );
}
