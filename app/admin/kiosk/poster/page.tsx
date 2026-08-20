import { redirect } from "next/navigation";
import { createServerDb, requireActor } from "@/lib/db/server";
import { makePosterToken } from "@/lib/qr";
import { QrSvg } from "@/components/ui/qr-svg";
import { PosterActions } from "./actions";

/* ============================================================================
   K-02 · The printed wall code.

   The alternative to leaving a tablet powered on at reception: one sheet of
   paper by the door that members scan on their way in.

   The trade is stated on the page itself rather than buried here, because the
   person choosing it should know what they are choosing. A screen code rotates
   every thirty seconds, so a photograph of it is worthless. Paper cannot
   rotate, so this code works until it is reprinted — which means someone can
   photograph it and check in from home.

   What that does NOT do is let the wrong person in, or let a lapsed member
   through: identity comes from the member's own session, and record_checkin
   decides on the server whether their membership permits entry. What it costs
   is the certainty that an attendance row means somebody was in the building,
   which is why these scans are recorded as 'poster' rather than 'qr'.
   ========================================================================= */

export const dynamic = "force-dynamic";

export default async function PosterPage() {
  const actor = await requireActor();
  if (!["owner", "manager"].includes(actor.role)) redirect("/admin");

  const db = await createServerDb();

  const [{ data: gym }, { data: device }] = await Promise.all([
    db.from("gyms").select("name").eq("id", actor.gymId).single(),
    db
      .from("kiosk_devices")
      .select("id, secret, poster_nonce, poster_printed_at")
      .eq("gym_id", actor.gymId)
      .not("poster_nonce", "is", null)
      .eq("is_active", true)
      .limit(1)
      .maybeSingle(),
  ]);

  const gymName = (gym as { name: string } | null)?.name ?? "Fitwell";
  const d = device as {
    id: string;
    secret: string;
    poster_nonce: string;
    poster_printed_at: string | null;
  } | null;

  /* Minted per request rather than stored. The token is a pure function of the
     secret and the nonce, so there is nothing to keep in sync — and the secret
     stays on the server either way. */
  const token = d ? await makePosterToken(d.secret, actor.gymId, d.id, d.poster_nonce) : null;

  return (
    <>
      {/* Everything except the sheet itself disappears when printed. */}
      <div className="print:hidden">
        <header className="mb-6">
          <p className="text-[12px] tracking-[0.08em] text-neutral-600 uppercase">Kiosk</p>
          <h1 className="mt-1 text-[28px] font-bold">Wall poster</h1>
          <p className="mt-2 max-w-[62ch] text-[13.5px] text-neutral-700">
            Print this and put it where members come in. They scan it with the
            app to check themselves in — no tablet, no reception queue.
          </p>
        </header>

        <div className="mb-6 max-w-[62ch] rounded-lg border border-accent-300 bg-surface p-4">
          <p className="text-[13px] font-semibold text-accent-800">
            Worth knowing before you print
          </p>
          <p className="mt-1.5 text-[12.5px] text-neutral-700">
            Paper cannot rotate, so this code keeps working until you print a
            new one. Someone who photographs it could check in without coming
            in. They still cannot check in as anyone but themselves, and an
            expired membership is still refused — but a visit logged this way
            means &ldquo;had the code&rdquo;, not &ldquo;was in the gym&rdquo;.
            Print a new one whenever you want that to stop.
          </p>
          <p className="mt-1.5 text-[12.5px] text-neutral-700">
            The kiosk screen at{" "}
            <span className="font-mono">/admin/kiosk</span> rotates every 30
            seconds and has none of this weakness. Use that instead if you have
            a spare tablet.
          </p>
        </div>

        <PosterActions hasPoster={d !== null} printedAt={d?.poster_printed_at ?? null} />
      </div>

      {token ? (
        /* The sheet. Sized for A4 and centred, with nothing else on the page
           when printed so a member sees a code and one instruction. */
        <div className="mt-8 print:mt-0">
          <div className="mx-auto max-w-[520px] rounded-lg border border-neutral-300 bg-white p-10 text-center print:max-w-none print:rounded-none print:border-0 print:p-0">
            <p className="text-[15px] font-semibold tracking-[0.14em] text-neutral-800 uppercase print:text-[18px]">
              {gymName}
            </p>
            <h2 className="mt-2 text-[34px] leading-tight font-bold text-neutral-900 print:text-[46px]">
              Scan to check in
            </h2>

            <QrSvg
              text={token}
              title={`${gymName} check-in code`}
              className="mx-auto mt-6 w-[300px] print:w-[420px]"
            />

            <p className="mt-6 text-[15px] text-neutral-800 print:text-[18px]">
              Open the <strong>{gymName}</strong> app, tap the{" "}
              <strong>QR button</strong>, point it here.
            </p>
            <p className="mt-1.5 text-[12.5px] text-neutral-600 print:text-[14px]">
              Not signed up yet? Ask at the front desk.
            </p>
          </div>
        </div>
      ) : (
        <p className="mt-8 text-[13.5px] text-neutral-600 print:hidden">
          No poster yet. Create one above and this page becomes the printable
          sheet.
        </p>
      )}
    </>
  );
}
