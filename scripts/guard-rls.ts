/* ============================================================================
   CI guard: every table created in a migration must get RLS, and every tenant
   table must carry gym_id.

   The runtime equivalent lives in tests/tenant-isolation.test.ts ("schema
   invariants"), which asserts against the built database. This is the static
   twin: it reads the migration SQL, so it fails on the offending line with a
   file and line number rather than on a mystery table name.

   Run: npm run guard:rls
   ========================================================================= */

import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const MIGRATIONS = path.join(process.cwd(), "supabase", "migrations");

/** Tables that legitimately have no gym_id, with the reason. */
const NON_TENANT: Record<string, string> = {
  gyms: "is the tenant root; scoped by id",
  profiles: "cross-tenant identity — one person, many gyms",
  role_permissions: "global reference data, identical for every tenant",
};

interface Found {
  table: string;
  file: string;
  line: number;
  body: string;
}

const created: Found[] = [];
const protectedBy = new Set<string>();

for (const file of readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort()) {
  const sql = readFileSync(path.join(MIGRATIONS, file), "utf8");

  /* Statement bodies, so a table's columns can be inspected for gym_id. */
  const createRe =
    /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?([a-z_][a-z0-9_]*)\s*\(([\s\S]*?)\n\);/gi;

  let m: RegExpExecArray | null;
  while ((m = createRe.exec(sql)) !== null) {
    created.push({
      table: m[1],
      file,
      line: sql.slice(0, m.index).split("\n").length,
      body: m[2],
    });
  }

  for (const g of sql.matchAll(
    /select\s+private\.apply_tenant_rls\(\s*'([a-z_][a-z0-9_]*)'/gi,
  )) {
    protectedBy.add(g[1]);
  }
  for (const g of sql.matchAll(
    /alter\s+table\s+(?:public\.)?([a-z_][a-z0-9_]*)\s+enable\s+row\s+level\s+security/gi,
  )) {
    protectedBy.add(g[1]);
  }
}

const problems: string[] = [];

for (const t of created) {
  if (!protectedBy.has(t.table)) {
    problems.push(
      `${t.file}:${t.line}  table "${t.table}" has no RLS\n` +
        `      add: select private.apply_tenant_rls('${t.table}', '<module>');`,
    );
  }

  // `primary key` implies NOT NULL, so a gym_id-keyed table (whatsapp_configs)
  // satisfies the invariant without spelling it out.
  const hasGymId = /^\s*gym_id\s+uuid\s+(?:not\s+null|primary\s+key)/im.test(t.body);
  if (!hasGymId && !(t.table in NON_TENANT)) {
    problems.push(
      `${t.file}:${t.line}  table "${t.table}" has no "gym_id uuid not null"\n` +
        `      Tenancy is never derived through a join. If this table really is\n` +
        `      not tenant data, add it to NON_TENANT in this script with a reason.`,
    );
  }
}

/* A FORCE clause is what makes policies bind the table owner too — without it
   a SECURITY DEFINER function silently bypasses tenant isolation. */
for (const file of readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql"))) {
  const sql = readFileSync(path.join(MIGRATIONS, file), "utf8");
  for (const g of sql.matchAll(
    /alter\s+table\s+(?:public\.)?([a-z_][a-z0-9_]*)\s+enable\s+row\s+level\s+security/gi,
  )) {
    const table = g[1];
    const forced = new RegExp(
      `alter\\s+table\\s+(?:public\\.)?${table}\\s+force\\s+row\\s+level\\s+security`,
      "i",
    ).test(sql);
    if (!forced) {
      problems.push(
        `${file}  table "${table}" enables RLS but does not FORCE it\n` +
          `      add: alter table ${table} force row level security;`,
      );
    }
  }
}

if (problems.length) {
  console.error(`\n✗ RLS guard found ${problems.length} problem(s):\n`);
  for (const p of problems) console.error("  " + p + "\n");
  process.exit(1);
}

console.log(
  `✓ RLS guard: ${created.length} tables, all protected, all tenant tables carry gym_id`,
);
