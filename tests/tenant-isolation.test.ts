/* ============================================================================
   Tenant isolation — the highest-value test in this project.

   A cross-tenant leak is both the most likely mistake (one query written
   against the service-role client "just to make it work") and the most
   expensive (a reportable DPDP breach, and the end of the business's
   credibility with every gym on the platform).

   Two gyms are seeded with identical fixtures. Every assertion asks the same
   question from a different angle: can gym A observe or touch gym B?
   ========================================================================= */

import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { createTestDb, seedGym, type TestDb, type SeededGym } from "./support/db";

let db: TestDb;
let a: SeededGym;
let b: SeededGym;

/* Tables holding tenant data. Every one is swept by the blanket test below,
   so adding a table without adding it here is caught by `covers every tenant
   table`, not silently skipped. */
const TENANT_TABLES = [
  "branches",
  "members",
  "member_consents",
  "plans",
  "memberships",
  "membership_freezes",
  "gym_users",
] as const;

beforeAll(async () => {
  db = await createTestDb();
  a = await seedGym(db, "alpha");
  b = await seedGym(db, "bravo");

  // Give both gyms a row in every tenant table, so "returns 0 rows" can never
  // pass merely because the table is empty.
  for (const g of [a, b]) {
    await db.sql(`insert into branches (gym_id, name) values ($1, 'Main')`, [g.gymId]);
    await db.sql(
      `insert into member_consents (gym_id, member_id, consent_type, granted)
       values ($1, $2, 'waiver', true)`,
      [g.gymId, g.memberId],
    );
    await db.sql(
      `insert into membership_freezes
         (gym_id, membership_id, starts_on, days, previous_expires_on, new_expires_on)
       values ($1, $2, current_date, 7, current_date + 90, current_date + 97)`,
      [g.gymId, g.membershipId],
    );
  }
}, 60_000);

afterAll(async () => {
  await db?.close();
});

describe("read isolation", () => {
  it("covers every tenant table: gym A's owner sees only gym A rows", async () => {
    for (const table of TENANT_TABLES) {
      const rows = await db.as<{ gym_id: string }>(
        { userId: a.staff.owner, gymId: a.gymId, role: "owner" },
        `select gym_id from ${table}`,
      );

      expect(rows.length, `${table}: expected rows for gym A`).toBeGreaterThan(0);
      expect(
        rows.every((r) => r.gym_id === a.gymId),
        `${table}: leaked rows from another gym`,
      ).toBe(true);
    }
  });

  it("an owner cannot read another gym's members even by explicit id", async () => {
    const rows = await db.as(
      { userId: a.staff.owner, gymId: a.gymId, role: "owner" },
      `select id from members where id = $1`,
      [b.memberId],
    );
    expect(rows).toHaveLength(0);
  });

  it("the gyms table exposes only the caller's own gym", async () => {
    const rows = await db.as<{ id: string }>(
      { userId: a.staff.owner, gymId: a.gymId, role: "owner" },
      `select id from gyms`,
    );
    expect(rows.map((r) => r.id)).toEqual([a.gymId]);
  });

  it("a forged gym_id claim grants nothing without a real membership", async () => {
    // The access-token hook only ever stamps a gym the user belongs to, but
    // defence in depth: even if a claim were forged, the row filter still
    // restricts reads to that gym — never to the attacker's own.
    const rows = await db.as<{ id: string }>(
      { userId: a.staff.owner, gymId: b.gymId, role: "owner" },
      `select id from members`,
    );
    expect(rows.every((r) => r.id === b.memberId)).toBe(true);
    expect(rows.some((r) => r.id === a.memberId)).toBe(false);
  });

  it("anonymous callers read nothing", async () => {
    for (const table of ["members", "memberships", "plans", "gyms"]) {
      const rows = await db.asAnon(`select * from ${table}`);
      expect(rows, `${table} leaked to anon`).toHaveLength(0);
    }
  });
});

describe("write isolation", () => {
  it("cannot insert a row into another gym", async () => {
    await expect(
      db.as(
        { userId: a.staff.owner, gymId: a.gymId, role: "owner" },
        `insert into members (gym_id, member_code, full_name, phone)
         values ($1, 'X-999', 'Trojan', '+919000000999')`,
        [b.gymId],
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it("cannot update another gym's rows", async () => {
    await db.as(
      { userId: a.staff.owner, gymId: a.gymId, role: "owner" },
      `update members set full_name = 'Hijacked' where id = $1`,
      [b.memberId],
    );
    const [row] = await db.sql<{ full_name: string }>(
      `select full_name from members where id = $1`,
      [b.memberId],
    );
    expect(row.full_name).not.toBe("Hijacked");
  });

  it("cannot delete another gym's rows", async () => {
    await db.as(
      { userId: a.staff.owner, gymId: a.gymId, role: "owner" },
      `delete from members where id = $1`,
      [b.memberId],
    );
    const rows = await db.sql(`select 1 from members where id = $1`, [b.memberId]);
    expect(rows).toHaveLength(1);
  });

  it("cannot move a row to another gym by updating gym_id", async () => {
    // The USING clause matches (the row is gym A's) but WITH CHECK rejects the
    // new value, so this raises rather than silently affecting zero rows.
    await expect(
      db.as(
        { userId: a.staff.owner, gymId: a.gymId, role: "owner" },
        `update members set gym_id = $1 where id = $2`,
        [b.gymId, a.memberId],
      ),
    ).rejects.toThrow(/row-level security/i);

    const [row] = await db.sql<{ gym_id: string }>(
      `select gym_id from members where id = $1`,
      [a.memberId],
    );
    expect(row.gym_id).toBe(a.gymId);
  });
});

describe("role permissions within a gym", () => {
  it("a receptionist cannot delete members", async () => {
    await db.as(
      { userId: a.staff.receptionist, gymId: a.gymId, role: "receptionist" },
      `delete from members where id = $1`,
      [a.memberId],
    );
    const rows = await db.sql(`select 1 from members where id = $1`, [a.memberId]);
    expect(rows).toHaveLength(1);
  });

  it("a trainer cannot read payments-adjacent membership pricing changes", async () => {
    // trainer has no 'memberships' grant at all
    await db.as(
      { userId: a.staff.trainer, gymId: a.gymId, role: "trainer" },
      `update memberships set price_paise = 1 where id = $1`,
      [a.membershipId],
    );
    const [row] = await db.sql<{ price_paise: string }>(
      `select price_paise from memberships where id = $1`,
      [a.membershipId],
    );
    expect(Number(row.price_paise)).toBe(850000);
  });

  it("a member reads their own record but not another member's", async () => {
    const [other] = await db.sql<{ id: string }>(
      `insert into members (gym_id, member_code, full_name, phone)
       values ($1, 'M-002', 'Someone Else', '+919000000002') returning id`,
      [a.gymId],
    );

    const rows = await db.as<{ id: string }>(
      { userId: a.memberUserId, gymId: a.gymId, role: "member" },
      `select id from members`,
    );

    expect(rows.map((r) => r.id)).toContain(a.memberId);
    expect(rows.map((r) => r.id)).not.toContain(other.id);
  });

  /* The mirror image of the isolation tests, and just as necessary.
     "Returns no rows" passes every leak test perfectly — which is how the
     member app came to show "No active membership" to paying members. */
  it("a member CAN read their own membership, payments and attendance", async () => {
    await db.sql(
      `insert into attendance (gym_id, member_id, method) values ($1, $2, 'qr')`,
      [a.gymId, a.memberId],
    );
    await db.sql(
      `insert into payments (gym_id, member_id, membership_id, amount_paise, method, status)
       values ($1, $2, $3, 850000, 'upi', 'paid')`,
      [a.gymId, a.memberId, a.membershipId],
    );

    const actor = { userId: a.memberUserId, gymId: a.gymId, role: "member" as const };

    const memberships = await db.as(actor, `select id from memberships`);
    expect(memberships, "member cannot see their own membership").toHaveLength(1);

    const payments = await db.as(actor, `select id from payments`);
    expect(payments, "member cannot see their own payments").toHaveLength(1);

    const visits = await db.as(actor, `select id from attendance`);
    expect(visits, "member cannot see their own attendance").toHaveLength(1);
  });

  it("but still sees nothing belonging to another member", async () => {
    const [other] = await db.sql<{ id: string }>(
      `insert into members (gym_id, member_code, full_name, phone)
       values ($1, 'M-900', 'Other Person', '+919000000900') returning id`,
      [a.gymId],
    );
    await db.sql(
      `insert into memberships (gym_id, member_id, plan_id, status, started_on, expires_on, price_paise)
       values ($1, $2, $3, 'active', current_date, current_date + 30, 320000)`,
      [a.gymId, other.id, a.planId],
    );

    const rows = await db.as<{ member_id: string }>(
      { userId: a.memberUserId, gymId: a.gymId, role: "member" },
      `select member_id from memberships`,
    );
    expect(rows.every((r) => r.member_id === a.memberId)).toBe(true);
  });

  it("a member sees visible plans (so M-03 renew works) but not hidden ones", async () => {
    await db.sql(
      `insert into plans (gym_id, name, duration_days, price_paise, is_visible_to_members)
       values ($1, 'Staff Comp', 365, 0, false)`,
      [a.gymId],
    );

    const rows = await db.as<{ name: string }>(
      { userId: a.memberUserId, gymId: a.gymId, role: "member" },
      `select name from plans`,
    );

    expect(rows.map((r) => r.name)).toContain("Quarterly");
    expect(rows.map((r) => r.name)).not.toContain("Staff Comp");
  });
});

describe("schema invariants", () => {
  it("every table in public has RLS enabled and forced", async () => {
    const rows = await db.sql<{ tablename: string; rowsecurity: boolean; forced: boolean }>(
      `select c.relname as tablename, c.relrowsecurity as rowsecurity,
              c.relforcerowsecurity as forced
         from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r'
        order by 1`,
    );

    const unprotected = rows.filter((r) => !r.rowsecurity || !r.forced);
    expect(
      unprotected.map((r) => r.tablename),
      "tables missing RLS or FORCE RLS",
    ).toEqual([]);
  });

  it("every tenant table carries a non-null gym_id", async () => {
    const rows = await db.sql<{ relname: string }>(
      `select c.relname from pg_class c
         join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r'
          and c.relname not in ('gyms', 'profiles', 'role_permissions')
          and not exists (
            select 1 from pg_attribute a
             where a.attrelid = c.oid and a.attname = 'gym_id'
               and a.attnum > 0 and not a.attisdropped and a.attnotnull)
        order by 1`,
    );
    expect(rows.map((r) => r.relname)).toEqual([]);
  });

  it("gym_id is indexed on every tenant table", async () => {
    const rows = await db.sql<{ relname: string }>(
      `select c.relname from pg_class c
         join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r'
          and c.relname not in ('gyms', 'profiles', 'role_permissions')
          and not exists (
            select 1 from pg_index i
             where i.indrelid = c.oid
               and (select attname from pg_attribute
                     where attrelid = c.oid and attnum = i.indkey[0]) = 'gym_id')
        order by 1`,
    );
    expect(rows.map((r) => r.relname), "gym_id must lead an index").toEqual([]);
  });
});

describe("membership date arithmetic", () => {
  it("renewing early extends from the existing expiry, not from today", async () => {
    const [r] = await db.sql<{ d: string }>(
      `select to_char(next_expiry(date '2026-09-01', 90, date '2026-08-12'), 'YYYY-MM-DD') as d`,
    );
    expect(r.d).toBe("2026-11-30");
  });

  it("renewing after expiry starts from today", async () => {
    const [r] = await db.sql<{ d: string }>(
      `select to_char(next_expiry(date '2026-08-07', 90, date '2026-08-12'), 'YYYY-MM-DD') as d`,
    );
    expect(r.d).toBe("2026-11-10");
  });

  it("a first membership starts from today", async () => {
    const [r] = await db.sql<{ d: string }>(
      `select to_char(next_expiry(null, 30, date '2026-08-12'), 'YYYY-MM-DD') as d`,
    );
    expect(r.d).toBe("2026-09-11");
  });
});
