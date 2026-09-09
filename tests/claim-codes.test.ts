/* ============================================================================
   Why a claim code did not work.

   /join had one answer for every failure — "this code has expired" — and it
   was right about one of the four things that can go wrong. The two it got
   wrong are the two that happen: a member who has finished signing up and
   re-scanned the QR, and a member holding a code reception replaced while the
   live one was still on the counter screen. Both were sent home.

   These pin the four states apart, and pin the thing that must not break
   while telling them apart: a code that is superseded or spent still has to
   be refused, by every function that can act on one.
   ========================================================================= */

import { beforeEach, afterEach, describe, expect, it } from "vitest";
import { createTestDb, seedGym, type TestDb, type SeededGym } from "./support/db";

let db: TestDb;
let gym: SeededGym;

/* The digest is opaque to these tests: nothing here needs the code itself,
   only that the same string was stored and looked up. */
const HASH = "a".repeat(64);

beforeEach(async () => {
  db = await createTestDb();
  gym = await seedGym(db, "claims");
  /* seedGym leaves the member already linked to a login. A claim starts from
     someone who has none. */
  await db.sql(`update members set user_id = null where id = $1`, [gym.memberId]);
}, 60_000);

afterEach(async () => {
  await db?.close();
});

async function issue(hash = HASH, hours = 24) {
  await db.sql(
    `insert into member_claim_codes (gym_id, member_id, code_hash, expires_at)
     values ($1, $2, $3, now() + make_interval(hours => $4))`,
    [gym.gymId, gym.memberId, hash, hours],
  );
}

const peek = async (hash = HASH) =>
  (await db.asAnon<{ status: string; full_name: string | null; masked_phone: string | null }>(
    `select * from claim_code_peek($1)`,
    [hash],
  ))[0];

describe("what /join is told about a code", () => {
  it("says ok, and who it is for, while it is live", async () => {
    await issue();
    const r = await peek();
    expect(r.status).toBe("ok");
    expect(r.full_name).toBe("claims Member");
    // Never the whole number.
    expect(r.masked_phone).toContain("••");
  });

  it("says expired once the 24 hours are up", async () => {
    await issue(HASH, -1);
    expect((await peek()).status).toBe("expired");
  });

  it("says used after a successful claim, not expired", async () => {
    await issue();
    await db.sql(`update member_claim_codes set used_at = now() where code_hash = $1`, [HASH]);
    expect((await peek()).status).toBe("used");
  });

  it("says superseded when reception has issued a newer one", async () => {
    await issue();
    await db.sql(
      `update member_claim_codes set superseded_at = now() where code_hash = $1`, [HASH]);
    expect((await peek()).status).toBe("superseded");
  });

  it("says unknown for a code that was never issued", async () => {
    expect((await peek("b".repeat(64))).status).toBe("unknown");
  });

  it("names nobody unless the code is live", async () => {
    /* The whole point of hashing these is that a code found on the floor is
       not a lookup for whose it was. That has to hold in every dead state,
       not just the live one. */
    await issue();
    const dead = [
      "used_at = now(), superseded_at = null",
      "used_at = null, superseded_at = now()",
      "used_at = null, superseded_at = null, expires_at = now() - interval '1 hour'",
    ];
    for (const set of dead) {
      await db.sql(`update member_claim_codes set ${set} where code_hash = $1`, [HASH]);
      const r = await peek();
      expect(r.full_name).toBeNull();
      expect(r.masked_phone).toBeNull();
    }
  });
});

describe("a code that is no longer live cannot be spent", () => {
  it("refuses the second factor once superseded", async () => {
    await issue();
    const live = await db.asAnon<{ member_id: string }>(
      `select * from claim_code_verify($1, $2)`, [HASH, "0001"]);
    expect(live).toHaveLength(1);   // the digits are right, so this is a real check

    await db.sql(
      `update member_claim_codes set superseded_at = now() where code_hash = $1`, [HASH]);

    const after = await db.asAnon(
      `select * from claim_code_verify($1, $2)`, [HASH, "0001"]);
    expect(after).toHaveLength(0);
  });

  it("refuses to complete a claim once superseded", async () => {
    await issue();
    await db.sql(
      `update member_claim_codes set superseded_at = now() where code_hash = $1`, [HASH]);

    await expect(
      db.sql(`select claim_code_complete($1, $2, $3, $4)`,
             [HASH, gym.memberId, gym.staff.member, "deadbeef"]),
    ).rejects.toThrow();

    /* And left nothing half-done: the member must not come out linked to a
       login off the back of a refused code. */
    const [m] = await db.sql<{ user_id: string | null }>(
      `select user_id from members where id = $1`, [gym.memberId]);
    expect(m.user_id).toBeNull();
  });
});
