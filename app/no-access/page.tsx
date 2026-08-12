import { Screen, Sub, Title } from "@/components/ui/primitives";

/* ============================================================================
   Signed in, but the token carries no gym.

   Two causes, and the member cannot fix either: their gym membership was
   revoked, or the access-token hook is not enabled on the Supabase project.
   Say so plainly rather than looping them through an empty dashboard.
   ========================================================================= */

export default function NoAccessPage() {
  return (
    <Screen center>
      <Title>No gym linked</Title>
      <Sub className="max-w-[300px]">
        Your account isn’t linked to a gym yet, or your access was removed.
        Reception can sort this out in a moment.
      </Sub>
      <a
        href="/login"
        className="mt-8 text-[12.5px] font-semibold text-app-accent hover:underline"
      >
        Back to sign in
      </a>
    </Screen>
  );
}
