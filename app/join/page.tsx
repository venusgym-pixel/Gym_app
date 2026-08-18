import Link from "next/link";
import { redirect } from "next/navigation";
import { canonicalCode } from "@/lib/auth/member-identity";
import { Hint, Label, PillInput, Screen, Sub, Title } from "@/components/ui/primitives";

/* ============================================================================
   Typing the code by hand, for when scanning is not an option — a cracked
   camera, a locked-down phone, or a member reading it off a printed slip.

   A plain GET form: it just routes to /join/[code], where the real flow is.
   No JavaScript needed to get that far.
   ========================================================================= */

export default async function JoinPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  /* The form below is a plain GET, so a submitted code lands here as a query
     parameter. Redirecting to the path form keeps one canonical URL — the
     same one the QR encodes — and means the flow works with no JavaScript. */
  const { code } = await searchParams;
  if (code?.trim()) redirect(`/join/${canonicalCode(code)}`);

  return (
    <Screen>
      <Title>Enter your code</Title>
      <Sub>The front desk will give you a six-character code.</Sub>

      <form action="/join" className="mt-6" id="join-form">
        <Label>Code</Label>
        {/* The action rewrites to /join/CODE in the route handler below; a
            bare GET would put it in the query string instead. */}
        <PillInput
          name="code"
          autoCapitalize="characters"
          autoComplete="off"
          placeholder="K7M-4Q2"
          className="font-mono tracking-[0.2em] uppercase"
          required
        />
        <Hint>Codes last 24 hours and can be used once.</Hint>

        <button
          type="submit"
          className="mt-6 w-full rounded-pill bg-app-accent py-4 text-[1.053em] font-bold text-app-accent-ink"
        >
          Continue
        </button>
      </form>

      <p className="mt-8 text-center text-[0.822em]" style={{ color: "var(--app-ink-45)" }}>
        Already set up?{" "}
        <Link href="/login" className="text-app-accent">
          Sign in
        </Link>
      </p>
    </Screen>
  );
}
