import { lookupClaimCode } from "@/lib/actions/member-access";
import { Screen, Sub, Title } from "@/components/ui/primitives";
import { ClaimFlow } from "../claim-flow";

/* ============================================================================
   S-07 · Claim your app access.

   Public, because the member has no account yet — this is the screen that
   creates one. Reached by scanning the QR on the counter screen, so the code
   arrives in the URL and there is nothing to type.

   The code alone is not enough: it also asks for the last four digits of
   their number. Reception hands the code over face to face, so this is what
   stops someone who merely glanced at the counter screen.
   ========================================================================= */

export const dynamic = "force-dynamic";

export default async function JoinWithCode({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const target = await lookupClaimCode(code);

  if (!target) {
    return (
      <Screen center>
        <Title>This code has expired</Title>
        <Sub>
          Codes last 24 hours and work once. Ask at the front desk for a new
          one — it takes a moment.
        </Sub>
      </Screen>
    );
  }

  return (
    <Screen>
      <p className="text-[0.789em]" style={{ color: "var(--app-ink-55)" }}>
        {target.gymName}
      </p>
      <Title className="mt-1">Is this you?</Title>

      <div
        className="mt-5 rounded-lg px-5 py-4"
        style={{ background: "var(--color-app-surface)" }}
      >
        <p className="text-[1.184em] font-semibold">{target.fullName}</p>
        <p className="mt-0.5 font-mono text-[0.888em]" style={{ color: "var(--app-ink-55)" }}>
          {target.maskedPhone}
        </p>
      </div>

      <ClaimFlow code={code} />
    </Screen>
  );
}
