/* ============================================================================
   The enquiry pipeline.

   Two halves, and the second is the one that keeps getting missed: a policy
   that returns nothing to everybody passes every isolation test ever written.
   So each "X cannot" here has a matching "Y can".

   The conversion path gets the most attention because it is the only write in
   the product that creates a member as a side effect, and the failure mode —
   a member created while the lead stays open, so someone rings them next week
   to sell them what they already bought — is invisible until it is
   embarrassing.
   ========================================================================= */

import { beforeEach, afterEach, describe, expect, it } from "vitest";
import { createTestDb, seedGym, type Role, type TestDb, type SeededGym } from "./support/db";

let db: TestDb;
let gym: SeededGym;

beforeEach(async () => {
  db = await createTestDb();
  gym = await seedGym(db, "leadgen");
}, 60_000);

afterEach(async () => { await db?.close(); });

interface Actor { userId: string; gymId: string; role: Role }

const owner = (): Actor => ({ userId: gym.staff.owner, gymId: gym.gymId, role: "owner" });
const reception = (): Actor =>
  ({ userId: gym.staff.receptionist, gymId: gym.gymId, role: "receptionist" });

async function addLead(
  actor: Actor,
  name = "Walk-in Wendy",
  phone = "+919845099001",
) {
  const [row] = await db.as<{ id: string }>(
    actor,
    `insert into leads (gym_id, full_name, phone, source, next_follow_up_on)
     values ($1, $2, $3, 'Walk-in', current_date) returning id`,
    [gym.gymId, name, phone],
  );
  return row.id;
}

describe("capturing an enquiry", () => {
  it("reception can add one and read it back", async () => {
    const id = await addLead(reception());
    const rows = await db.as(reception(), `select id, status from leads`);
    expect(rows).toHaveLength(1);
    expect((rows[0] as { status: string }).status).toBe("new");
    expect(id).toBeTruthy();
  });

  it("the same number twice is one lead, not two", async () => {
    await addLead(owner());
    await expect(addLead(owner(), "Wendy again")).rejects.toThrow(/duplicate key/i);
  });

  it("a member cannot see the pipeline", async () => {
    await addLead(owner());
    const member = { userId: gym.memberUserId, gymId: gym.gymId, role: "member" as const };
    expect(await db.as(member, `select id from leads`)).toHaveLength(0);
  });

  it("another gym cannot see it either", async () => {
    await addLead(owner());
    const other = await seedGym(db, "rivalleads");
    const theirOwner = { userId: other.staff.owner, gymId: other.gymId, role: "owner" as const };
    expect(await db.as(theirOwner, `select id from leads`)).toHaveLength(0);
  });
});

describe("converting", () => {
  it("creates the member and closes the lead in one go", async () => {
    const id = await addLead(owner());

    const [r] = await db.as<{ convert_lead: string }>(
      owner(), `select convert_lead($1)`, [id],
    );
    const memberId = r.convert_lead;
    expect(memberId).toBeTruthy();

    const [lead] = await db.sql<{
      status: string; converted_member_id: string; next_follow_up_on: string | null;
    }>(`select status, converted_member_id, next_follow_up_on from leads where id = $1`, [id]);

    expect(lead.status).toBe("won");
    expect(lead.converted_member_id).toBe(memberId);
    /* The call-back date must be cleared, or the new member reappears on
       tomorrow's "who to call" list. */
    expect(lead.next_follow_up_on).toBeNull();

    const [m] = await db.sql<{ full_name: string; phone: string; member_code: string }>(
      `select full_name, phone, member_code from members where id = $1`, [memberId],
    );
    expect(m.full_name).toBe("Walk-in Wendy");
    expect(m.phone).toBe("+919845099001");
    expect(m.member_code).toMatch(/^M-\d{3}$/);
  });

  it("is idempotent — a double-click does not create two members", async () => {
    const id = await addLead(owner());
    const [a] = await db.as<{ convert_lead: string }>(owner(), `select convert_lead($1)`, [id]);
    const [b] = await db.as<{ convert_lead: string }>(owner(), `select convert_lead($1)`, [id]);
    expect(b.convert_lead).toBe(a.convert_lead);

    const all = await db.sql(`select id from members where gym_id = $1`, [gym.gymId]);
    expect(all).toHaveLength(2); // the seeded member, plus Wendy — not three
  });

  it("reuses an existing member rather than colliding on the phone number", async () => {
    /* A lapsed member enquiring again is the common case, and the
       (gym_id, phone) unique index would otherwise abort the conversion. */
    const [existing] = await db.sql<{ id: string; phone: string }>(
      `select id, phone from members where id = $1`, [gym.memberId],
    );
    const id = await addLead(owner(), "Returning Ravi", existing.phone);

    const [r] = await db.as<{ convert_lead: string }>(owner(), `select convert_lead($1)`, [id]);
    expect(r.convert_lead).toBe(existing.id);

    const all = await db.sql(`select id from members where gym_id = $1`, [gym.gymId]);
    expect(all).toHaveLength(1);
  });

  it("writes an activity trail", async () => {
    const id = await addLead(owner());
    await db.as(owner(), `select convert_lead($1)`, [id]);

    const acts = await db.as<{ kind: string; body: string }>(
      owner(), `select kind, body from lead_activities where lead_id = $1`, [id],
    );
    expect(acts.some((a) => a.kind === "status" && /Converted/.test(a.body))).toBe(true);
  });

  it("a trainer cannot convert anyone", async () => {
    const id = await addLead(owner());
    const trainer = { userId: gym.staff.trainer, gymId: gym.gymId, role: "trainer" as const };

    /* The trainer has no leads grant at all, so RLS hides the row and the
       function reports it missing — which is the same answer either way. */
    await expect(
      db.as(trainer, `select convert_lead($1)`, [id]),
    ).rejects.toThrow(/lead not found/i);
  });
});
