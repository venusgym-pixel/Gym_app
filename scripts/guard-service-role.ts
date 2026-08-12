/* ============================================================================
   CI guard: the service-role key may be referenced in exactly one file.

   The service role bypasses row-level security entirely. The realistic way a
   cross-tenant leak enters this codebase is someone (or an AI assistant)
   reaching for the admin client to make a stubborn query work. This makes that
   fail the build instead of shipping.

   Run: npm run guard:service-role
   ========================================================================= */

import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

/** The single sanctioned construction site. */
const ALLOWED = [
  path.join("lib", "db", "admin.ts"),
  path.join("lib", "db", "env.ts"), // reads the key to hand to admin.ts
  path.join("scripts", "guard-service-role.ts"), // this file
];

const SKIP_DIRS = new Set([
  "node_modules", ".next", ".git", "out", "build", "coverage",
  "prototype", "docs", ".netlify", ".vercel",
]);

const PATTERNS: { re: RegExp; what: string }[] = [
  { re: /SUPABASE_SERVICE_ROLE_KEY/, what: "service-role key reference" },
  { re: /service_role/, what: "service_role literal" },
  { re: /unsafeAcrossAllGyms/, what: "cross-tenant admin escape hatch" },
];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(entry)) out.push(full);
  }
  return out;
}

const violations: string[] = [];

for (const file of walk(ROOT)) {
  const rel = path.relative(ROOT, file);

  /* unsafeAcrossAllGyms is additionally permitted in the cron worker, which is
     genuinely platform-wide. Everything else is a violation. */
  const isAllowed =
    ALLOWED.includes(rel) ||
    rel.startsWith(path.join("app", "api", "jobs")) ||
    rel.startsWith(path.join("tests", "support"));

  if (isAllowed) continue;

  const lines = readFileSync(file, "utf8").split("\n");
  lines.forEach((line, i) => {
    if (line.trimStart().startsWith("*") || line.trimStart().startsWith("//")) return;
    for (const { re, what } of PATTERNS) {
      if (re.test(line)) {
        violations.push(`${rel}:${i + 1}  ${what}\n    ${line.trim().slice(0, 100)}`);
      }
    }
  });
}

if (violations.length) {
  console.error(
    `\n✗ Service-role access found outside lib/db/admin.ts (${violations.length}):\n`,
  );
  for (const v of violations) console.error("  " + v + "\n");
  console.error(
    "  The service role bypasses RLS. If you need data the caller cannot see,\n" +
      "  write a policy — or route the work through withGymScope() in\n" +
      "  lib/db/admin.ts, which forces you to name the tenant.\n",
  );
  process.exit(1);
}

console.log("✓ service-role access confined to lib/db/admin.ts");
