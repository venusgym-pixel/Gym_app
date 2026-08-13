import { createServerDb, requireActor } from "@/lib/db/server";
import { Card, EmptyState, PageHeader } from "@/components/admin/shell";
import { can, MATRIX, MODULES } from "@/lib/auth/permissions";
import { InviteStaff, StaffRow } from "./client";
import type { GymRole } from "@/lib/db/database.types";

/* ============================================================================
   A-38 / A-39 · Staff and what each role can do.

   The permission matrix is rendered on the page rather than left in a spec.
   "Can reception see the revenue report?" is asked every time a gym hires,
   and the honest answer is a table — one that comes from the same MATRIX the
   nav and the server actions use, so it cannot drift from reality.
   ========================================================================= */

export const dynamic = "force-dynamic";

interface StaffMember {
  user_id: string;
  role: GymRole;
  is_active: boolean;
  revoked_at: string | null;
  created_at: string;
  profiles: { full_name: string | null; email: string | null; phone: string | null } | null;
}

export default async function StaffPage() {
  const actor = await requireActor();
  const db = await createServerDb();
  const role = actor.role as GymRole;

  const [{ data: staff }] = await Promise.all([
    db
      .from("gym_users")
      .select("user_id, role, is_active, revoked_at, created_at, profiles(full_name, email, phone)")
      .eq("gym_id", actor.gymId)
      .order("created_at"),
  ]);

  /* Members hold a gym_users row too — that is how their app login is
     scoped — but they are not staff, and listing them here rendered a role
     dropdown that had no 'member' option and so displayed the first one,
     "Manager". Two members appeared to be managers. They belong on
     /admin/members; this screen is people who work here. */
  const all = (staff ?? []) as unknown as StaffMember[];
  const rows = all.filter((r) => r.role !== "member");
  const memberLogins = all.length - rows.length;

  const active = rows.filter((r) => !r.revoked_at);
  const revoked = rows.filter((r) => r.revoked_at);
  const mayEdit = can(role, "staff", "edit");

  return (
    <>
      <PageHeader
        eyebrow="Team"
        title="Staff"
        sub={
          `${active.length} with access` +
          (revoked.length ? ` · ${revoked.length} revoked` : "") +
          (memberLogins
            ? ` · ${memberLogins} member ${memberLogins === 1 ? "login" : "logins"} not shown`
            : "")
        }
      />

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-4">
          <Card title="With access">
            {active.length === 0 ? (
              <EmptyState>Nobody else has access yet.</EmptyState>
            ) : (
              <ul className="divide-y divide-neutral-300">
                {active.map((s) => (
                  <StaffRow
                    key={s.user_id}
                    userId={s.user_id}
                    name={s.profiles?.full_name ?? s.profiles?.email ?? "Unnamed"}
                    email={s.profiles?.email ?? null}
                    role={s.role}
                    isSelf={s.user_id === actor.userId}
                    canEdit={mayEdit}
                    revoked={false}
                  />
                ))}
              </ul>
            )}
          </Card>

          {revoked.length > 0 && (
            <Card title="Revoked">
              <ul className="divide-y divide-neutral-300">
                {revoked.map((s) => (
                  <StaffRow
                    key={s.user_id}
                    userId={s.user_id}
                    name={s.profiles?.full_name ?? s.profiles?.email ?? "Unnamed"}
                    email={s.profiles?.email ?? null}
                    role={s.role}
                    isSelf={s.user_id === actor.userId}
                    canEdit={mayEdit}
                    revoked
                  />
                ))}
              </ul>
            </Card>
          )}

          <Card title="What each role can do">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-[12px]">
                <thead>
                  <tr className="border-b border-neutral-300 text-left text-neutral-600">
                    <th className="py-2 pr-3 font-medium">Area</th>
                    {(["owner", "manager", "trainer", "receptionist", "nutritionist"] as GymRole[]).map(
                      (r) => (
                        <th key={r} className="py-2 pr-3 font-medium capitalize">{r}</th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {MODULES.map((m) => (
                    <tr key={m} className="border-b border-neutral-200 last:border-0">
                      <td className="py-1.5 pr-3 capitalize">{m}</td>
                      {(["owner", "manager", "trainer", "receptionist", "nutritionist"] as GymRole[]).map(
                        (r) => {
                          const grant = MATRIX[r]?.[m];
                          const letters =
                            !grant || !grant.view
                              ? "—"
                              : [
                                  "v",
                                  grant.create && "c",
                                  grant.edit && "e",
                                  grant.delete && "d",
                                ]
                                  .filter(Boolean)
                                  .join("");
                          return (
                            <td
                              key={r}
                              className={`py-1.5 pr-3 font-mono ${
                                letters === "—" ? "text-neutral-400" : "text-neutral-800"
                              }`}
                              title={grant && grant.view ? `scope: ${grant.scope}` : "no access"}
                            >
                              {letters}
                            </td>
                          );
                        },
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-[11.5px] text-neutral-600">
              v view · c create · e edit · d delete. Hover a cell for its scope —
              a trainer&rsquo;s <span className="font-mono">assigned</span> means their own
              clients only, enforced by the database, not by this screen.
            </p>
          </Card>
        </div>

        <div>
          {can(role, "staff", "create") ? (
            <Card title="Add someone">
              <InviteStaff />
            </Card>
          ) : (
            <Card title="Add someone">
              <EmptyState>Only an owner or manager can add staff.</EmptyState>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
