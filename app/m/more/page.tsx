import Link from "next/link";
import { createServerDb, requireActor } from "@/lib/db/server";
import { MemberTabBar } from "@/components/member/nav";
import { Screen } from "@/components/ui/primitives";
import { formatDate } from "@/lib/money";

/* ============================================================================
   Member account screen.

   Reachable from the tab bar, which previously linked here and 404'd. It
   exists mainly so there is somewhere to sign out from — the app is a PWA
   installed on a personal phone, but people share handsets and lend them to
   family, and "I cannot get out of this account" is a support call.
   ========================================================================= */

export const dynamic = "force-dynamic";

export default async function MorePage() {
  const actor = await requireActor();
  const db = await createServerDb();

  const [{ data: gym }, { data: member }] = await Promise.all([
    db.from("gyms").select("name, phone, address").eq("id", actor.gymId).single(),
    db
      .from("members")
      .select("member_code, full_name, phone, email, joined_on, emergency_contact_name, emergency_contact_phone")
      .eq("gym_id", actor.gymId)
      .eq("user_id", actor.userId)
      .maybeSingle(),
  ]);

  const g = gym as { name: string; phone: string | null; address: string | null } | null;
  const m = member as {
    member_code: string;
    full_name: string;
    phone: string;
    email: string | null;
    joined_on: string;
    emergency_contact_name: string | null;
    emergency_contact_phone: string | null;
  } | null;

  return (
    <>
      <Screen className="pb-32">
        <h1 className="text-[28px]">Account</h1>

        {m && (
          <section
            className="mt-5 rounded-lg p-5"
            style={{ background: "var(--color-app-surface)" }}
          >
            <p className="text-[18px]">{m.full_name}</p>
            <p className="mt-1 font-mono text-[12px]" style={{ color: "var(--app-ink-55)" }}>
              {m.member_code}
            </p>
            <dl className="mt-4 space-y-2 text-[13px]">
              <Row label="Phone" value={m.phone} />
              {m.email && <Row label="Email" value={m.email} />}
              <Row label="Member since" value={formatDate(m.joined_on)} />
              {m.emergency_contact_name && (
                <Row
                  label="Emergency"
                  value={`${m.emergency_contact_name}${
                    m.emergency_contact_phone ? ` · ${m.emergency_contact_phone}` : ""
                  }`}
                />
              )}
            </dl>
          </section>
        )}

        <section
          className="mt-3 rounded-lg p-5"
          style={{ background: "var(--color-app-surface)" }}
        >
          <p className="text-[11px] tracking-[0.08em] uppercase"
             style={{ color: "var(--app-ink-50)" }}>
            Your gym
          </p>
          <p className="mt-1.5 text-[16px]">{g?.name}</p>
          {g?.address && (
            <p className="mt-1 text-[12.5px]" style={{ color: "var(--app-ink-55)" }}>
              {g.address}
            </p>
          )}
          {g?.phone && (
            <a
              href={`tel:${g.phone}`}
              className="mt-2 inline-block text-[13px] font-semibold text-app-accent"
            >
              Call reception
            </a>
          )}
        </section>

        <nav className="mt-3 flex flex-col">
          <Item href="/m/membership" label="Membership and renewals" />
          <Item href="/m/attendance" label="Your visits" />
        </nav>

        {/* A plain form post: no JavaScript required, so signing out works
            even when hydration has failed. */}
        <form action="/api/auth/signout" method="post" className="mt-8">
          <button
            type="submit"
            className="w-full rounded-pill py-4 text-[15px] font-bold"
            style={{
              border: "1px solid var(--app-border-strong)",
              color: "var(--color-app-accent)",
            }}
          >
            Sign out
          </button>
        </form>

        <p
          className="mt-4 text-center text-[11.5px]"
          style={{ color: "var(--app-ink-40)" }}
        >
          Signed in as {actor.email ?? "this account"}
        </p>
      </Screen>

      <MemberTabBar current="/m/more" />
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt style={{ color: "var(--app-ink-55)" }}>{label}</dt>
      <dd className="text-right">{value}</dd>
    </div>
  );
}

function Item({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between rounded-lg px-5 py-4 text-[14px]"
      style={{ background: "var(--color-app-surface)", marginBottom: 8 }}
    >
      {label}
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
           stroke="var(--app-ink-40)" strokeWidth="2.75" strokeLinecap="round">
        <path d="M9 18l6-6-6-6" />
      </svg>
    </Link>
  );
}
