/* ============================================================================
   The coaching loop — the product's stated differentiator.

     trainer assigns a plan -> member sees today's workout with last week's
     numbers -> logs every set -> finishes -> trainer sees actual vs
     prescribed -> the next suggestion moves

   Run against real Postgres with the real migrations, like the rest.
   ========================================================================= */

import { beforeEach, afterEach, describe, expect, it } from "vitest";
import { createTestDb, seedGym, type TestDb, type SeededGym } from "./support/db";

let db: TestDb;
let gym: SeededGym;
let planId: string;
let benchId: string;
let squatId: string;

beforeEach(async () => {
  db = await createTestDb();
  gym = await seedGym(db, "coach");

  await db.sql(`select seed_gym_exercises($1)`, [gym.gymId]);
  const [p] = await db.sql<{ seed_starter_plan: string }>(
    `select seed_starter_plan($1, $2)`, [gym.gymId, gym.staff.trainer],
  );
  planId = p.seed_starter_plan;

  const ex = await db.sql<{ id: string; name: string }>(
    `select id, name from exercises where gym_id = $1 and name = any($2)`,
    [gym.gymId, ["Barbell bench press", "Back squat"]],
  );
  benchId = ex.find((e) => e.name === "Barbell bench press")!.id;
  squatId = ex.find((e) => e.name === "Back squat")!.id;

  await db.sql(
    `insert into trainer_clients (gym_id, trainer_id, member_id) values ($1, $2, $3)`,
    [gym.gymId, gym.staff.trainer, gym.memberId],
  );
}, 60_000);

afterEach(async () => { await db?.close(); });

async function assignPlan() {
  await db.sql(
    `insert into workout_assignments (gym_id, member_id, plan_id, assigned_by)
     values ($1, $2, $3, $4)`,
    [gym.gymId, gym.memberId, planId, gym.staff.trainer],
  );
}

async function today() {
  const [r] = await db.sql<{ todays_workout: Record<string, unknown> }>(
    `select todays_workout($1, $2)`, [gym.gymId, gym.memberId],
  );
  return r.todays_workout as {
    assigned: boolean; day_name?: string; day_id?: string; day_index?: number;
    day_count?: number; open_session_id?: string | null;
    exercises?: { exercise_id: string; name: string; sets: number;
                  target_reps: number; last: { reps: number; weight_kg: string } | null }[];
  };
}

describe("the library and the starter plan", () => {
  it("seeds a usable library and a 3-day split", async () => {
    const [{ n }] = await db.sql<{ n: string }>(
      `select count(*) n from exercises where gym_id = $1`, [gym.gymId]);
    expect(Number(n)).toBeGreaterThanOrEqual(28);

    const days = await db.sql<{ name: string; day_index: number }>(
      `select name, day_index from workout_days where plan_id = $1 order by day_index`,
      [planId]);
    expect(days).toHaveLength(3);
    expect(days[0].name).toContain("Push");

    const [{ n: moves }] = await db.sql<{ n: string }>(
      `select count(*) n from workout_exercises where gym_id = $1`, [gym.gymId]);
    expect(Number(moves)).toBe(15); // 3 days x 5 movements
  });

  it("is idempotent — re-seeding adds nothing", async () => {
    await db.sql(`select seed_gym_exercises($1)`, [gym.gymId]);
    await db.sql(`select seed_starter_plan($1, null)`, [gym.gymId]);
    const [{ n }] = await db.sql<{ n: string }>(
      `select count(*) n from workout_plans where gym_id = $1`, [gym.gymId]);
    expect(Number(n)).toBe(1);
  });
});

describe("today's workout", () => {
  it("says so when nothing is assigned", async () => {
    expect((await today()).assigned).toBe(false);
  });

  it("returns day 1 with the prescribed sets", async () => {
    await assignPlan();
    const t = await today();
    expect(t.assigned).toBe(true);
    expect(t.day_index).toBe(1);
    expect(t.day_name).toContain("Push");
    expect(t.exercises).toHaveLength(5);
    expect(t.exercises![0].name).toBe("Barbell bench press");
    expect(t.exercises![0].sets).toBe(3);
    expect(t.exercises![0].last).toBeNull();   // nothing logged yet
  });

  it("rotates to the next day in the split after each session", async () => {
    await assignPlan();
    const t1 = await today();

    const [s] = await db.sql<{ start_workout_session: string }>(
      `select start_workout_session($1, $2, $3)`,
      [gym.gymId, gym.memberId, t1.day_id]);
    await db.sql(`select finish_workout_session($1, $2)`,
                 [gym.gymId, s.start_workout_session]);

    const t2 = await today();
    expect(t2.day_index).toBe(2);
    expect(t2.day_name).toContain("Pull");
  });
});

describe("logging a session", () => {
  it("carries last week's numbers into the next one", async () => {
    await assignPlan();
    const t = await today();

    const [s1] = await db.sql<{ start_workout_session: string }>(
      `select start_workout_session($1, $2, $3)`,
      [gym.gymId, gym.memberId, t.day_id]);
    const session = s1.start_workout_session;

    for (const set of [1, 2, 3]) {
      await db.sql(
        `select log_set($1, $2, $3, $4::smallint, $5::smallint, $6, $7::smallint)`,
        [gym.gymId, session, benchId, set, 10, 60, 10]);
    }
    await db.sql(`select finish_workout_session($1, $2, 3::smallint, 'felt good')`,
                 [gym.gymId, session]);

    /* Back to day 1 after a full rotation, and now with history. */
    for (const idx of [2, 3]) {
      const tn = await today();
      expect(tn.day_index).toBe(idx);
      const [sn] = await db.sql<{ start_workout_session: string }>(
        `select start_workout_session($1, $2, $3)`, [gym.gymId, gym.memberId, tn.day_id]);
      await db.sql(`select finish_workout_session($1, $2)`, [gym.gymId, sn.start_workout_session]);
    }

    const back = await today();
    expect(back.day_index).toBe(1);
    const bench = back.exercises!.find((e) => e.name === "Barbell bench press")!;
    expect(bench.last).not.toBeNull();
    expect(Number(bench.last!.weight_kg)).toBe(60);
    expect(bench.last!.reps).toBe(10);
  });

  it("re-logging the same set corrects it rather than adding another", async () => {
    await assignPlan();
    const t = await today();
    const [s] = await db.sql<{ start_workout_session: string }>(
      `select start_workout_session($1, $2, $3)`, [gym.gymId, gym.memberId, t.day_id]);

    await db.sql(`select log_set($1, $2, $3, 1::smallint, 8::smallint, 60)`,
                 [gym.gymId, s.start_workout_session, benchId]);
    await db.sql(`select log_set($1, $2, $3, 1::smallint, 10::smallint, 62.5)`,
                 [gym.gymId, s.start_workout_session, benchId]);

    const rows = await db.sql<{ reps: number; weight_kg: string }>(
      `select reps, weight_kg from set_logs where session_id = $1`,
      [s.start_workout_session]);
    expect(rows).toHaveLength(1);
    expect(rows[0].reps).toBe(10);
    expect(Number(rows[0].weight_kg)).toBe(62.5);
  });

  it("re-opening mid-workout resumes rather than starting a second session", async () => {
    await assignPlan();
    const t = await today();
    const [a] = await db.sql<{ start_workout_session: string }>(
      `select start_workout_session($1, $2, $3)`, [gym.gymId, gym.memberId, t.day_id]);
    const [b] = await db.sql<{ start_workout_session: string }>(
      `select start_workout_session($1, $2, $3)`, [gym.gymId, gym.memberId, t.day_id]);
    expect(b.start_workout_session).toBe(a.start_workout_session);

    const t2 = await today();
    expect(t2.open_session_id).toBe(a.start_workout_session);
  });

  it("summarises volume and flags a personal best", async () => {
    await assignPlan();
    const t = await today();
    const [s] = await db.sql<{ start_workout_session: string }>(
      `select start_workout_session($1, $2, $3)`, [gym.gymId, gym.memberId, t.day_id]);

    await db.sql(`select log_set($1, $2, $3, 1::smallint, 10::smallint, 60)`,
                 [gym.gymId, s.start_workout_session, benchId]);
    await db.sql(`select log_set($1, $2, $3, 2::smallint, 8::smallint, 65)`,
                 [gym.gymId, s.start_workout_session, benchId]);

    const [r] = await db.sql<{ finish_workout_session: Record<string, unknown> }>(
      `select finish_workout_session($1, $2, 4::smallint, null)`,
      [gym.gymId, s.start_workout_session]);
    const out = r.finish_workout_session as {
      sets: number; volume_kg: number; prs: { exercise: string; weight_kg: string }[];
    };

    expect(Number(out.sets)).toBe(2);
    expect(Number(out.volume_kg)).toBe(10 * 60 + 8 * 65);  // 1120
    expect(out.prs.map((p) => p.exercise)).toContain("Barbell bench press");
  });
});

describe("progression suggestions", () => {
  async function logSession(exercise: string, weight: number, reps: number, target: number) {
    const t = await today();
    const [s] = await db.sql<{ start_workout_session: string }>(
      `select start_workout_session($1, $2, $3)`, [gym.gymId, gym.memberId, t.day_id]);
    await db.sql(
      `select log_set($1, $2, $3, 1::smallint, $4::smallint, $5, $6::smallint)`,
      [gym.gymId, s.start_workout_session, exercise, reps, weight, target]);
    await db.sql(`select finish_workout_session($1, $2)`, [gym.gymId, s.start_workout_session]);
  }

  async function suggest(exercise: string) {
    const [r] = await db.sql<{ suggest_next_weight: { suggestion: number | null; reason: string } }>(
      `select suggest_next_weight($1, $2, $3)`, [gym.gymId, gym.memberId, exercise]);
    return r.suggest_next_weight;
  }

  it("says nothing without history", async () => {
    await assignPlan();
    expect((await suggest(benchId)).suggestion).toBeNull();
  });

  it("adds 2.5kg to an upper-body lift when every rep was hit", async () => {
    await assignPlan();
    await logSession(benchId, 60, 10, 10);
    const s = await suggest(benchId);
    expect(Number(s.suggestion)).toBe(62.5);
    expect(s.reason).toContain("hit every rep");
  });

  it("adds 5kg to a lower-body lift", async () => {
    await assignPlan();
    await logSession(squatId, 80, 10, 10);
    expect(Number((await suggest(squatId)).suggestion)).toBe(85);
  });

  it("holds the weight after two sessions of missed reps", async () => {
    await assignPlan();
    await logSession(benchId, 70, 7, 10);
    await logSession(benchId, 70, 8, 10);
    const s = await suggest(benchId);
    expect(Number(s.suggestion)).toBe(70);
    expect(s.reason).toContain("hold");
  });
});

describe("who can see a member's training", () => {
  it("the member can read and write their own sets", async () => {
    await assignPlan();
    const t = await today();
    const [s] = await db.sql<{ start_workout_session: string }>(
      `select start_workout_session($1, $2, $3)`, [gym.gymId, gym.memberId, t.day_id]);
    await db.sql(`select log_set($1, $2, $3, 1::smallint, 10::smallint, 60)`,
                 [gym.gymId, s.start_workout_session, benchId]);

    const actor = { userId: gym.memberUserId, gymId: gym.gymId, role: "member" as const };
    expect(await db.as(actor, `select id from workout_sessions`)).toHaveLength(1);
    expect(await db.as(actor, `select id from set_logs`)).toHaveLength(1);
    expect(await db.as(actor, `select id from workout_assignments`)).toHaveLength(1);
  });

  it("their assigned trainer can read them", async () => {
    await assignPlan();
    const t = await today();
    const [s] = await db.sql<{ start_workout_session: string }>(
      `select start_workout_session($1, $2, $3)`, [gym.gymId, gym.memberId, t.day_id]);
    await db.sql(`select log_set($1, $2, $3, 1::smallint, 10::smallint, 60)`,
                 [gym.gymId, s.start_workout_session, benchId]);

    const trainer = { userId: gym.staff.trainer, gymId: gym.gymId, role: "trainer" as const };
    expect(await db.as(trainer, `select id from workout_sessions`)).toHaveLength(1);
    expect(await db.as(trainer, `select id from set_logs`)).toHaveLength(1);
    expect(await db.as(trainer, `select id from members`)).toHaveLength(1);
  });

  it("an unassigned trainer sees nothing of theirs", async () => {
    await assignPlan();
    await db.sql(`delete from trainer_clients where gym_id = $1`, [gym.gymId]);

    const trainer = { userId: gym.staff.trainer, gymId: gym.gymId, role: "trainer" as const };
    expect(await db.as(trainer, `select id from members`)).toHaveLength(0);
    expect(await db.as(trainer, `select id from workout_sessions`)).toHaveLength(0);
  });

  it("a trainer at another gym sees nothing at all", async () => {
    await assignPlan();
    const other = await seedGym(db, "rival");
    const trainer = { userId: other.staff.trainer, gymId: other.gymId, role: "trainer" as const };
    expect(await db.as(trainer, `select id from workout_sessions`)).toHaveLength(0);
    expect(await db.as(trainer, `select id from set_logs`)).toHaveLength(0);
  });
});

describe("measurements", () => {
  it("a member records their own, and a second entry the same day corrects it", async () => {
    const actor = { userId: gym.memberUserId, gymId: gym.gymId, role: "member" as const };

    await db.as(actor,
      `insert into measurements (gym_id, member_id, weight_kg, waist_cm)
       values ($1, $2, 76.6, 89)`, [gym.gymId, gym.memberId]);

    await expect(
      db.as(actor,
        `insert into measurements (gym_id, member_id, weight_kg) values ($1, $2, 74.2)`,
        [gym.gymId, gym.memberId]),
    ).rejects.toThrow(/duplicate key|unique/i);

    const rows = await db.as<{ weight_kg: string }>(actor, `select weight_kg from measurements`);
    expect(rows).toHaveLength(1);
  });
});
