/* ============================================================================
   Equipment — inventory RLS, the invoker-safe seed, and the trainer delete
   policies the plan builder depends on (0019).

   The interesting failure modes:
     · a trainer or member WRITING inventory (only owner/manager may)
     · the seed function inserting into someone else's gym (it is SECURITY
       INVOKER precisely so RLS stops that)
     · a trainer unable to DELETE plan structure — the 0017 gap that 0019
       closes; without it the builder can add but never remove.
   ========================================================================= */

import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { createTestDb, seedGym, type TestDb, type SeededGym } from "./support/db";

let db: TestDb;
let gymA: SeededGym;
let gymB: SeededGym;

beforeAll(async () => {
  db = await createTestDb();
  gymA = await seedGym(db, "kita");
  gymB = await seedGym(db, "kitb");
}, 60_000);

afterAll(async () => {
  await db?.close();
});

const actor = (gym: SeededGym, role: keyof SeededGym["staff"]) => ({
  userId: gym.staff[role],
  gymId: gym.gymId,
  role,
});

describe("the equipment inventory", () => {
  it("lets the owner seed a starter floor, idempotently", async () => {
    const [first] = await db.as<{ seed_gym_equipment: number }>(
      actor(gymA, "owner"),
      `select seed_gym_equipment($1)`,
      [gymA.gymId],
    );
    expect(first.seed_gym_equipment).toBeGreaterThanOrEqual(14);

    const [again] = await db.as<{ seed_gym_equipment: number }>(
      actor(gymA, "owner"),
      `select seed_gym_equipment($1)`,
      [gymA.gymId],
    );
    expect(again.seed_gym_equipment).toBe(0);
  });

  it("stops the seed from writing into another gym — it runs as the caller", async () => {
    await expect(
      db.as(actor(gymB, "owner"), `select seed_gym_equipment($1)`, [gymA.gymId]),
    ).rejects.toThrow();
  });

  it("lets owner and manager write, trainer and reception only read", async () => {
    await db.as(
      actor(gymA, "manager"),
      `insert into equipment (gym_id, name, category) values ($1, 'Smith machine', 'machine')`,
      [gymA.gymId],
    );

    const seen = await db.as<{ name: string }>(
      actor(gymA, "trainer"),
      `select name from equipment where name = 'Smith machine'`,
    );
    expect(seen).toHaveLength(1);

    await expect(
      db.as(
        actor(gymA, "trainer"),
        `insert into equipment (gym_id, name, category) values ($1, 'Rogue rack', 'bench_rack')`,
        [gymA.gymId],
      ),
    ).rejects.toThrow();

    /* An update blocked by RLS does not error — the USING clause just
       matches zero rows. The proof is the status staying put. */
    await db.as(
      actor(gymA, "receptionist"),
      `update equipment set status = 'out_of_order' where name = 'Smith machine'`,
    );
    const [after] = await db.sql<{ status: string }>(
      `select status from equipment where gym_id = $1 and name = 'Smith machine'`,
      [gymA.gymId],
    );
    expect(after.status).toBe("working");
  });

  it("keeps gyms invisible to each other", async () => {
    const other = await db.as<{ n: string }>(
      actor(gymB, "owner"),
      `select count(*) n from equipment`,
    );
    expect(Number(other[0].n)).toBe(0);
  });

  it("lets an exercise point at a machine, and survives the machine's deletion", async () => {
    await db.sql(`select seed_gym_exercises($1)`, [gymA.gymId]);
    const [machine] = await db.sql<{ id: string }>(
      `select id from equipment where gym_id = $1 and name = 'Lat pulldown machine'`,
      [gymA.gymId],
    );

    await db.as(
      actor(gymA, "trainer"),
      `update exercises set equipment_id = $1 where gym_id = $2 and name = 'Lat pulldown'`,
      [machine.id, gymA.gymId],
    );

    await db.sql(`delete from equipment where id = $1`, [machine.id]);
    const [ex] = await db.sql<{ equipment_id: string | null }>(
      `select equipment_id from exercises where gym_id = $1 and name = 'Lat pulldown'`,
      [gymA.gymId],
    );
    expect(ex.equipment_id).toBeNull();
  });
});

describe("trainer delete policies on plan structure (the 0017 gap)", () => {
  it("lets a trainer remove an exercise and a day from a plan they can edit", async () => {
    const [p] = await db.sql<{ seed_starter_plan: string }>(
      `select seed_starter_plan($1, $2)`,
      [gymA.gymId, gymA.staff.trainer],
    );
    const planId = p.seed_starter_plan;

    const t = actor(gymA, "trainer");

    const before = await db.as<{ id: string; day_id: string }>(
      t,
      `select we.id, we.day_id from workout_exercises we
        join workout_days wd on wd.id = we.day_id
       where wd.plan_id = $1 and wd.day_index = 1 and we.position = 1`,
      [planId],
    );
    expect(before).toHaveLength(1);

    await db.as(t, `delete from workout_exercises where id = $1`, [before[0].id]);
    const gone = await db.as(
      t, `select 1 from workout_exercises where id = $1`, [before[0].id],
    );
    expect(gone).toHaveLength(0);

    await db.as(t, `delete from workout_days where plan_id = $1 and day_index = 3`, [planId]);
    const days = await db.as<{ n: string }>(
      t, `select count(*) n from workout_days where plan_id = $1`, [planId],
    );
    expect(Number(days[0].n)).toBe(2);
  });

  it("still refuses a member deleting plan structure", async () => {
    const plans = await db.sql<{ id: string }>(
      `select id from workout_plans where gym_id = $1`, [gymA.gymId],
    );
    // RLS filters the delete to zero rows rather than erroring — the plan
    // must simply survive.
    await db.as(
      { userId: gymA.memberUserId, gymId: gymA.gymId, role: "member" },
      `delete from workout_days where plan_id = $1`,
      [plans[0].id],
    );
    const left = await db.sql<{ n: string }>(
      `select count(*) n from workout_days where plan_id = $1`, [plans[0].id],
    );
    expect(Number(left[0].n)).toBeGreaterThan(0);
  });
});
