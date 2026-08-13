/* ============================================================================
   The permission matrix exists twice: as SQL seed data (which the database
   enforces through RLS) and as a TypeScript table (which the UI reads to
   decide what to render).

   Two sources of truth drift. When they do the failure is nasty and quiet —
   a button renders, the user clicks it, and the database silently returns
   nothing. This test makes drift a red build instead.
   ========================================================================= */

import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "./support/db";
import {
  MATRIX, MODULES, can, grantFor, homeFor, scopeOf, seesWholeGym,
  mayOpen, surfaceFor, surfaceForPath, type Module,
} from "../lib/auth/permissions";
import type { GymRole } from "../lib/db/database.types";

let db: TestDb;

interface Row {
  role: GymRole;
  module: string;
  can_view: boolean;
  can_create: boolean;
  can_edit: boolean;
  can_delete: boolean;
  scope: string;
}

let rows: Row[];

beforeAll(async () => {
  db = await createTestDb();
  rows = await db.sql<Row>(`select * from role_permissions order by role, module`);
}, 60_000);

afterAll(async () => {
  await db?.close();
});

describe("TypeScript matrix matches the database seed", () => {
  it("every seeded grant is present in MATRIX with identical flags", () => {
    const mismatches: string[] = [];

    for (const r of rows) {
      const grant = grantFor(r.role, r.module as Module);
      const same =
        grant.view === r.can_view &&
        grant.create === r.can_create &&
        grant.edit === r.can_edit &&
        grant.delete === r.can_delete &&
        grant.scope === r.scope;

      if (!same) {
        mismatches.push(
          `${r.role}/${r.module}\n` +
            `      sql: v=${r.can_view} c=${r.can_create} e=${r.can_edit} d=${r.can_delete} scope=${r.scope}\n` +
            `      ts : v=${grant.view} c=${grant.create} e=${grant.edit} d=${grant.delete} scope=${grant.scope}`,
        );
      }
    }

    expect(mismatches, `\n  ${mismatches.join("\n  ")}\n`).toEqual([]);
  });

  it("MATRIX grants nothing the database has not seeded", () => {
    const seeded = new Set(rows.map((r) => `${r.role}/${r.module}`));
    const extra: string[] = [];

    for (const [role, modules] of Object.entries(MATRIX)) {
      for (const [mod, grant] of Object.entries(modules)) {
        const grantsSomething =
          grant.view || grant.create || grant.edit || grant.delete;
        if (grantsSomething && !seeded.has(`${role}/${mod}`)) {
          extra.push(`${role}/${mod} — in TypeScript, missing from the SQL seed`);
        }
      }
    }

    expect(extra, `\n  ${extra.join("\n  ")}\n`).toEqual([]);
  });

  it("every module name in MATRIX is a real module", () => {
    const known = new Set<string>(MODULES);
    const unknown: string[] = [];
    for (const [role, modules] of Object.entries(MATRIX)) {
      for (const mod of Object.keys(modules)) {
        if (!known.has(mod)) unknown.push(`${role}/${mod}`);
      }
    }
    expect(unknown).toEqual([]);
  });

  it("every module the database seeds is declared in MODULES", () => {
    const known = new Set<string>(MODULES);
    const unknown = [...new Set(rows.map((r) => r.module))].filter((m) => !known.has(m));
    expect(unknown).toEqual([]);
  });
});

describe("the shape of the matrix", () => {
  it("an owner can do everything, everywhere", () => {
    for (const m of MODULES) {
      for (const a of ["view", "create", "edit", "delete"] as const) {
        expect(can("owner", m, a), `owner should ${a} ${m}`).toBe(true);
      }
      expect(scopeOf("owner", m)).toBe("all");
    }
  });

  it("a member is confined to their own records", () => {
    for (const m of MODULES) {
      const scope = scopeOf("member", m);
      // 'exercises' is the one shared library every member may browse.
      const allowed = m === "exercises" ? ["all"] : ["own", "none"];
      expect(allowed, `member scope on ${m} was '${scope}'`).toContain(scope);
    }
  });

  it("only staff roles reach staff, leads and reports", () => {
    for (const role of ["trainer", "nutritionist", "member"] as const) {
      expect(can(role, "staff", "view")).toBe(false);
      expect(can(role, "leads", "view")).toBe(false);
    }
    expect(can("member", "reports", "view")).toBe(false);
  });

  it("no role but the owner may delete payments", () => {
    for (const role of Object.keys(MATRIX) as GymRole[]) {
      if (role === "owner") continue;
      expect(can(role, "payments", "delete"), `${role} must not delete payments`).toBe(false);
    }
  });

  it("seesWholeGym is false for scoped roles, matching the RLS generator", () => {
    // The generated policies require scope='all', so these roles get nothing
    // from them and depend on explicit narrower policies.
    expect(seesWholeGym("trainer", "members")).toBe(false);
    expect(seesWholeGym("member", "members")).toBe(false);
    expect(seesWholeGym("nutritionist", "members")).toBe(false);
    expect(seesWholeGym("receptionist", "members")).toBe(true);
    expect(seesWholeGym("owner", "members")).toBe(true);
  });
});

describe("surface routing", () => {
  it("sends each role to the right app", () => {
    expect(homeFor("owner")).toBe("/admin");
    expect(homeFor("manager")).toBe("/admin");
    expect(homeFor("receptionist")).toBe("/admin");
    expect(homeFor("trainer")).toBe("/trainer");
    expect(homeFor("nutritionist")).toBe("/trainer");
    expect(homeFor("member")).toBe("/m");
  });

  it("maps paths back to surfaces without prefix collisions", () => {
    expect(surfaceForPath("/admin")).toBe("admin");
    expect(surfaceForPath("/admin/members/123")).toBe("admin");
    expect(surfaceForPath("/trainer/clients")).toBe("trainer");
    expect(surfaceForPath("/m")).toBe("member");
    expect(surfaceForPath("/m/workout")).toBe("member");
    expect(surfaceForPath("/login")).toBeNull();
    expect(surfaceForPath("/")).toBeNull();
    // /members must not be mistaken for the /m surface
    expect(surfaceForPath("/members")).toBeNull();
  });

  it("owners and managers may also open the trainer surface", () => {
    for (const role of ["owner", "manager"] as const) {
      expect(mayOpen(role, "admin")).toBe(true);
      expect(mayOpen(role, "trainer"), `${role} supervises coaching`).toBe(true);
      expect(mayOpen(role, "member"), "staff have no member record").toBe(false);
    }
  });

  it("narrower roles stay in their own surface", () => {
    expect(mayOpen("receptionist", "trainer")).toBe(false);
    expect(mayOpen("trainer", "admin")).toBe(false);
    expect(mayOpen("member", "admin")).toBe(false);
    expect(mayOpen("member", "trainer")).toBe(false);
    expect(mayOpen("member", "member")).toBe(true);
  });

  it("every role resolves to a surface", () => {
    for (const role of Object.keys(MATRIX) as GymRole[]) {
      expect(["admin", "trainer", "member"]).toContain(surfaceFor(role));
    }
  });
});
