/* ============================================================================
   Test database — boots real Postgres (PGlite/WASM) and applies the actual
   migration files, so the policies under test are the ones that ship.

   Why not `supabase start`? It needs Docker, which puts the highest-value
   test in the project behind an optional dependency. This runs anywhere Node
   runs, including CI, in about a second.

   What this does NOT cover: the custom access token hook itself (it runs
   inside GoTrue, not Postgres) and Supabase's real `auth` schema. Those need
   the smoke test against a Supabase branch — see tests/README.md.
   ========================================================================= */

import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const MIGRATIONS = path.join(process.cwd(), "supabase", "migrations");

export type Role =
  | "owner"
  | "manager"
  | "trainer"
  | "receptionist"
  | "nutritionist"
  | "member";

/* Stand-ins for what the Supabase platform provides. Kept deliberately thin —
   anything richer risks the tests passing against a fiction. */
const SUPABASE_STUBS = `
  create schema if not exists auth;

  create table auth.users (
    id                uuid primary key default gen_random_uuid(),
    email             text,
    phone             text,
    raw_app_meta_data jsonb default '{}'::jsonb
  );

  create or replace function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'sub', '')::uuid;
  $$;

  do $$ begin create role anon;                exception when duplicate_object then null; end $$;
  do $$ begin create role authenticated;       exception when duplicate_object then null; end $$;
  do $$ begin create role service_role;        exception when duplicate_object then null; end $$;
  do $$ begin create role supabase_auth_admin; exception when duplicate_object then null; end $$;

  -- PGlite bundles neither; gen_random_uuid() is core since PG13.
  create domain citext as text;

  -- pgcrypto stand-in. Real Supabase has the extension; here only
  -- gen_random_bytes is needed (kiosk device secrets), and test secrets do
  -- not need to be cryptographically strong.
  create or replace function gen_random_bytes(n integer) returns bytea
  language sql volatile as $fn$
    select decode(
      string_agg(md5(random()::text || clock_timestamp()::text), ''),
      'hex')
    from generate_series(1, greatest(1, (n + 15) / 16));
  $fn$;
`;

/* Supabase grants these to every API role by default; PGlite does not.
   `anon` is granted deliberately, matching production: it means the anon tests
   prove the POLICIES deny access, not merely that a GRANT is missing. Take the
   grant away and those tests would pass for the wrong reason. */
const GRANTS = `
  grant usage on schema public to authenticated, anon, service_role;
  grant select, insert, update, delete
    on all tables in schema public to authenticated, anon, service_role;
  grant usage, select on all sequences in schema public to authenticated, service_role;
`;

export interface TestDb {
  /** Raw query as superuser — bypasses RLS. Use for fixtures only. */
  sql<T = Record<string, unknown>>(q: string, params?: unknown[]): Promise<T[]>;
  /** Run a query as a signed-in user of a gym, with RLS enforced. */
  as<T = Record<string, unknown>>(
    actor: { userId: string; gymId: string; role: Role },
    q: string,
    params?: unknown[],
  ): Promise<T[]>;
  /** Run a query as an unauthenticated caller. */
  asAnon<T = Record<string, unknown>>(q: string, params?: unknown[]): Promise<T[]>;
  close(): Promise<void>;
}

export async function createTestDb(): Promise<TestDb> {
  const db = await new PGlite();
  await db.exec(SUPABASE_STUBS);

  for (const file of readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort()) {
    const raw = readFileSync(path.join(MIGRATIONS, file), "utf8");
    const sql = raw
      .replace(/create extension if not exists "(pg_cron|pgcrypto|citext)";/g, "")
      .replace(/^\s*select\s+cron\.schedule[\s\S]*?;\s*$/gim, "");
    try {
      await db.exec(sql);
    } catch (e) {
      throw new Error(`migration ${file} failed: ${(e as Error).message}`);
    }
  }

  await db.exec(GRANTS);

  /* Impersonation mirrors PostgREST: set the JWT claims GUC, switch to the
     `authenticated` role, run, then reset. `authenticated` is not a superuser,
     so RLS genuinely applies — which is the entire point of these tests. */
  async function withRole<T>(
    role: string,
    claims: Record<string, unknown> | null,
    q: string,
    params: unknown[],
  ): Promise<T[]> {
    await db.exec("begin");
    try {
      await db.query("select set_config('request.jwt.claims', $1, true)", [
        claims ? JSON.stringify(claims) : "",
      ]);
      await db.exec(`set local role ${role}`);
      const res = await db.query<T>(q, params);
      await db.exec("commit");
      return res.rows;
    } catch (e) {
      await db.exec("rollback");
      throw e;
    }
  }

  return {
    async sql<T>(q: string, params: unknown[] = []) {
      return (await db.query<T>(q, params)).rows;
    },

    async as<T>(
      actor: { userId: string; gymId: string; role: Role },
      q: string,
      params: unknown[] = [],
    ) {
      return withRole<T>("authenticated", {
        sub: actor.userId,
        role: "authenticated",
        app_metadata: { gym_id: actor.gymId, gym_role: actor.role },
      }, q, params);
    },

    async asAnon<T>(q: string, params: unknown[] = []) {
      return withRole<T>("anon", null, q, params);
    },

    async close() {
      await db.close();
    },
  };
}

/* ── fixtures ─────────────────────────────────────────────────────────────── */

export interface SeededGym {
  gymId: string;
  planId: string;
  memberId: string;
  membershipId: string;
  staff: Record<Role, string>;
  memberUserId: string;
}

/** Creates a fully-populated gym: staff of every role, a plan, a member with
 *  an app login, and an active membership. */
export async function seedGym(db: TestDb, slug: string): Promise<SeededGym> {
  const [gym] = await db.sql<{ id: string }>(
    `insert into gyms (name, slug) values ($1, $2) returning id`,
    [`${slug} Fitness`, slug],
  );

  const roles: Role[] = [
    "owner", "manager", "trainer", "receptionist", "nutritionist", "member",
  ];
  const staff = {} as Record<Role, string>;

  for (const role of roles) {
    const [u] = await db.sql<{ id: string }>(
      `insert into auth.users (email) values ($1) returning id`,
      [`${role}@${slug}.test`],
    );
    await db.sql(
      `insert into profiles (id, full_name, email) values ($1, $2, $3)`,
      [u.id, `${slug} ${role}`, `${role}@${slug}.test`],
    );
    await db.sql(
      `insert into gym_users (gym_id, user_id, role) values ($1, $2, $3)`,
      [gym.id, u.id, role],
    );
    staff[role] = u.id;
  }

  const [plan] = await db.sql<{ id: string }>(
    `insert into plans (gym_id, name, duration_days, price_paise)
     values ($1, 'Quarterly', 90, 850000) returning id`,
    [gym.id],
  );

  const [member] = await db.sql<{ id: string }>(
    `insert into members (gym_id, user_id, member_code, full_name, phone)
     values ($1, $2, 'M-001', $3, $4) returning id`,
    [gym.id, staff.member, `${slug} Member`, `+9198${slug.length}0000001`],
  );

  const [membership] = await db.sql<{ id: string }>(
    `insert into memberships
       (gym_id, member_id, plan_id, status, started_on, expires_on, price_paise)
     values ($1, $2, $3, 'active', current_date, current_date + 90, 850000)
     returning id`,
    [gym.id, member.id, plan.id],
  );

  return {
    gymId: gym.id,
    planId: plan.id,
    memberId: member.id,
    membershipId: membership.id,
    staff,
    memberUserId: staff.member,
  };
}
