/* ============================================================================
   One payment, counted once.

   Split from payment-approval.test.ts purely for memory: every test here
   stands up a real Postgres, and past about fifteen in one file the worker
   dies of V8 zone exhaustion before reporting anything. Files run in separate
   forks, so splitting reclaims between them.
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

describe("the same money cannot be counted twice", () => {
  it("allows only one outstanding claim per member", async () => {
    await claim();
    /* The pay screen hides itself while a claim is waiting, but that is
       presentation. Two taps on a slow connection, or a direct API call,
       would otherwise leave reception two cards to approve for one payment. */
    await expect(
      db.as(
        member(),
        `select claim_payment($1, $2, $3, 'upi', 'proofs/again.jpg', 'UPI-REF-2')`,
        [gym.gymId, gym.memberId, gym.planId],
      ),
    ).rejects.toThrow(/payments_one_open_claim|duplicate key/i);
  });

  it("refuses a UPI reference that has already been used", async () => {
    const first = await claim();
    await db.as(owner(), `select * from approve_payment($1, $2)`, [first, gym.planId]);

    /* Reusing last month's reference is the cheapest possible fraud, and the
       UTR is the one part of a screenshot that cannot be honestly repeated. */
    await expect(
      db.as(
        member(),
        `select claim_payment($1, $2, $3, 'upi', 'proofs/reuse.jpg', 'UPI-REF-1')`,
        [gym.gymId, gym.memberId, gym.planId],
      ),
    ).rejects.toThrow(/payments_reference_once|duplicate key/i);
  });

  it("ignores spacing in the reference", async () => {
    const first = await claim();
    await db.as(owner(), `select * from approve_payment($1, $2)`, [first, gym.planId]);

    /* An index on the raw text is defeated by pressing space, and a UTR is
       routinely shown in groups of four. */
    await expect(
      db.as(
        member(),
        `select claim_payment($1, $2, $3, 'upi', 'proofs/spaced.jpg', 'upi ref 1')`,
        [gym.gymId, gym.memberId, gym.planId],
      ),
    ).rejects.toThrow(/payments_reference_once|duplicate key/i);
  });

  it("does not constrain what reception types at the desk", async () => {
    /* At the desk the same field means "UPI reference, cheque number" and
       reception writes whatever helps them remember. Two people paying cash
       and both noted 'cash' must still record — refusing to bank real money
       is a worse failure than the fraud the index guards against. */
    await db.sql(
      `select * from record_payment_and_extend($1, $2, $3, 'cash', 'cash', $4)`,
      [gym.gymId, gym.memberId, gym.planId, gym.staff.receptionist],
    );
    const [second] = await db.sql<{ payment_id: string }>(
      `select * from record_payment_and_extend($1, $2, $3, 'cash', 'cash', $4)`,
      [gym.gymId, gym.memberId, gym.planId, gym.staff.receptionist],
    );
    expect(second.payment_id).toBeTruthy();
  });

  it("still allows a fresh claim after the first is settled", async () => {
    const first = await claim();
    await db.as(owner(), `select * from approve_payment($1, $2)`, [first, gym.planId]);

    const [row] = await db.as<{ claim_payment: string }>(
      member(),
      `select claim_payment($1, $2, $3, 'upi', 'proofs/next.jpg', 'UPI-REF-NEW')`,
      [gym.gymId, gym.memberId, gym.planId],
    );
    expect(row.claim_payment).toBeTruthy();
  });
});
