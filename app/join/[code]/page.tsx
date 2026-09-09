import Link from "next/link";
import { lookupClaimCode, type ClaimStatus } from "@/lib/actions/member-access";
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

/* Four different situations, and only one of them means "come back to the
   desk". The old screen said that for all of them — including to a member who
   had just finished signing up and pressed back, and to one holding a code
   reception had replaced thirty seconds earlier while a live QR sat on the
   screen in front of them. */
const REASONS: Record<Exclude<ClaimStatus, "ok">, { title: string; sub: string }> = {
  used: {
    title: "This code has already been used",
    sub: "If that was you, your account is set up — sign in with your mobile number and the password you chose.",
  },
  superseded: {
    title: "There is a newer code",
    sub: "The front desk created another one after this, which replaced it. Scan the code on their screen, or ask them to show it again.",
  },
  expired: {
    title: "This code has expired",
    sub: "Codes last 24 hours. Ask at the front desk for a new one — it takes a moment.",
  },
  unknown: {
    title: "That code is not valid",
    sub: "Check you have it right, or ask the front desk for a new one. If you have set up your account already, sign in instead.",
  },
};

export default async function JoinWithCode({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const { status, target } = await lookupClaimCode(code);

  if (!target) {
    const reason = REASONS[status as Exclude<ClaimStatus, "ok">] ?? REASONS.unknown;
    return (
      <Screen center>
        <Title>{reason.title}</Title>
        <Sub>{reason.sub}</Sub>

        {/* Always offered, whatever went wrong. Every one of these states can
            belong to somebody who already has an account, and the previous
            screen was a dead end for all of them. */}
        <div className="mt-7 flex flex-col items-center gap-3">
          <Link
            href="/login"
            className="rounded-pill bg-app-accent px-7 py-3.5 text-[1.053em] font-bold text-app-accent-ink"
          >
            Sign in
          </Link>
          <Link href="/join" className="text-[0.888em] text-app-accent underline">
            Enter a different code
          </Link>
        </div>
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
