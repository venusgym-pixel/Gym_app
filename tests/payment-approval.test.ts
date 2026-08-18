/* ============================================================================
   Claiming a payment, and approving it.

   The rule this suite exists to defend: a member uploading a screenshot must
   change NOTHING. No membership extension, no invoice, no revenue. Otherwise
   any picture buys a month, and a GST invoice gets issued against money that
   never arrived — which cannot be cleanly undone, because invoice numbers are
   gap-free per gym per financial year.
   ========================================================================= */

import { beforeEach, afterEach, describe, expect, it } from "vitest";
import { createTestDb, seedGym, type Role, type TestDb, type SeededGym } from "./support/db";

let db: TestDb;
let gym: SeededGym;

beforeEach(async () => {
  db = await createTestDb();
  gym = await seedGym(db, "paywall");
}, 60_000);

afterEach(async () => { await db?.close(); });

interface Actor { userId: string; gymId: string; role: Role }
const owner = (): Actor => ({ userId: gym.staff.owner, gymId: gym.gymId, role: "owner" });
const member = (): Actor => ({ userId: gym.memberUserId, gymId: gym.gymId, role: "member" });

async function claim() {
  const [row] = await db.as<{ claim_payment: string }>(
    member(),
    `select claim_payment($1, $2, $3, 'upi', 'proofs/shot.jpg', 'UPI-REF-1')`,
    [gym.gymId, gym.memberId, gym.planId],
  );
  return row.claim_payment;
}

describe("a member claiming a payment", () => {
  it("records the claim and changes nothing else", async () => {
    const before = await db.sql<{ n: string }>(
      `select count(*) as n from memberships where member_id = $1`, [gym.memberId]);

    const id = await claim();

    const [pay] = await db.sql<{ status: string; paid_at: string | null; proof_path: string }>(
      `select status, paid_at, proof_path from payments where id = $1`, [id]);
    expect(pay.status).toBe("awaiting_verification");
    expect(pay.paid_at).toBeNull();
    expect(pay.proof_path).toBe("proofs/shot.jpg");

    // No invoice for money nobody has seen.
    const invoices = await db.sql(`select id from invoices where payment_id = $1`, [id]);
    expect(invoices).toHaveLength(0);

    // And no extra membership term.
    const after = await db.sql<{ n: string }>(
      `select count(*) as n from memberships where member_id = $1`, [gym.memberId]);
    expect(after[0].n).toBe(before[0].n);
  });

  it("does not count as revenue", async () => {
    await claim();
    const [row] = await db.sql<{ total: string | null }>(
      `select sum(amount_paise) as total from payments
        where gym_id = $1 and status = 'paid'`, [gym.gymId]);
    expect(row.total ?? "0").toBe("0");
  });

  it("cannot be claimed as paid directly", async () => {
    /* The member insert policy pins status to awaiting_verification, so a
       crafted request cannot mark its own payment paid. */
    await expect(
      db.as(
        member(),
        `insert into payments (gym_id, member_id, amount_paise, method, status)
         values ($1, $2, 100000, 'upi', 'paid')`,
        [gym.gymId, gym.memberId],
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it("cannot be claimed on someone else's behalf", async () => {
    const [other] = await db.sql<{ id: string }>(
      `insert into members (gym_id, member_code, full_name, phone)
       values ($1, 'M-999', 'Someone Else', '+919000000999') returning id`,
      [gym.gymId],
    );
    await expect(
      db.as(
        member(),
        `insert into payments (gym_id, member_id, amount_paise, method, status)
         values ($1, $2, 100000, 'upi', 'awaiting_verification')`,
        [gym.gymId, other.id],
      ),
    ).rejects.toThrow(/row-level security/i);
  });
});

describe("approving it", () => {
  it("extends the membership and issues exactly one invoice", async () => {
    const id = await claim();
    const [res] = await db.as<{ membership_id: string; invoice_id: string; expires_on: string }>(
      owner(), `select * from approve_payment($1, $2)`, [id, gym.planId]);

    expect(res.membership_id).toBeTruthy();
    expect(res.invoice_id).toBeTruthy();

    const [pay] = await db.sql<{ status: string; paid_at: string | null }>(
      `select status, paid_at from payments where id = $1`, [id]);
    expect(pay.status).toBe("paid");
    expect(pay.paid_at).not.toBeNull();
  });

  it("leaves exactly ONE payment row", async () => {
    /* The obvious implementation — insert a fresh payment and mark the claim
       superseded — double-counts in every revenue figure in the product. */
    const id = await claim();
    await db.as(owner(), `select * from approve_payment($1, $2)`, [id, gym.planId]);

    const rows = await db.sql(`select id from payments where member_id = $1`, [gym.memberId]);
    expect(rows).toHaveLength(1);
  });

  it("keeps the proof attached to the approved payment", async () => {
    const id = await claim();
    await db.as(owner(), `select * from approve_payment($1, $2)`, [id, gym.planId]);
    const [pay] = await db.sql<{ proof_path: string; verified_by: string | null }>(
      `select proof_path, verified_by from payments where id = $1`, [id]);
    expect(pay.proof_path).toBe("proofs/shot.jpg");
    expect(pay.verified_by).toBe(gym.staff.owner);
  });

  it("cannot be approved twice", async () => {
    const id = await claim();
    await db.as(owner(), `select * from approve_payment($1, $2)`, [id, gym.planId]);
    await expect(
      db.as(owner(), `select * from approve_payment($1, $2)`, [id, gym.planId]),
    ).rejects.toThrow(/not awaiting verification/i);
  });

  it("cannot be approved by the member who claimed it", async () => {
    const id = await claim();
    await expect(
      db.as(member(), `select * from approve_payment($1, $2)`, [id, gym.planId]),
    ).rejects.toThrow(/not permitted/i);
  });

  it("cannot be approved from another gym", async () => {
    const id = await claim();
    const other = await seedGym(db, "rivalpay");
    await expect(
      db.as(
        { userId: other.staff.owner, gymId: other.gymId, role: "owner" },
        `select * from approve_payment($1, $2)`,
        [id, gym.planId],
      ),
    ).rejects.toThrow(/not permitted/i);
  });
});

describe("rejecting it", () => {
  it("marks it failed with a reason and extends nothing", async () => {
    const id = await claim();
    await db.as(owner(), `select reject_payment($1, $2)`, [id, "Screenshot was for another gym"]);

    const [pay] = await db.sql<{ status: string; rejected_reason: string }>(
      `select status, rejected_reason from payments where id = $1`, [id]);
    expect(pay.status).toBe("failed");
    expect(pay.rejected_reason).toMatch(/another gym/);

    const invoices = await db.sql(`select id from invoices where payment_id = $1`, [id]);
    expect(invoices).toHaveLength(0);
  });
});

describe("money taken at the desk is unaffected", () => {
  it("still records, extends and invoices in one step", async () => {
    const [res] = await db.sql<{ payment_id: string; invoice_id: string }>(
      `select * from record_payment_and_extend($1, $2, $3, 'cash', 'at the counter', $4)`,
      [gym.gymId, gym.memberId, gym.planId, gym.staff.receptionist],
    );
    const [pay] = await db.sql<{ status: string }>(
      `select status from payments where id = $1`, [res.payment_id]);
    expect(pay.status).toBe("paid");
    expect(res.invoice_id).toBeTruthy();
  });
});
