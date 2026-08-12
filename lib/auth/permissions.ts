/* ============================================================================
   Permissions — the TypeScript side of the role matrix in
   supabase/migrations/*_auth_hook_and_permissions.sql.

   The database is the enforcement point; RLS decides what a query returns
   regardless of anything here. This exists so the UI can decide what to RENDER
   — which nav items appear, which buttons are disabled — without a round trip
   per check, and so a typo in a module name is a compile error rather than a
   silently-denied query.

   Keep MODULES and the matrix in sync with the SQL seed. The
   `matrix matches the database` test in tests/permissions.test.ts fails if
   they drift.
   ========================================================================= */

import type { GymRole } from "@/lib/db/database.types";

export const MODULES = [
  "dashboard",
  "members",
  "memberships",
  "payments",
  "attendance",
  "workouts",
  "exercises",
  "diet",
  "progress",
  "staff",
  "leads",
  "messaging",
  "reports",
  "settings",
] as const;

export type Module = (typeof MODULES)[number];
export type Action = "view" | "create" | "edit" | "delete";

/** 'all' = every record in the gym · 'assigned' = linked clients only ·
 *  'own' = the caller's own records · 'none' = no access. */
export type Scope = "all" | "assigned" | "own" | "none";

export interface Grant {
  view: boolean;
  create: boolean;
  edit: boolean;
  delete: boolean;
  scope: Scope;
}

const NONE: Grant = {
  view: false, create: false, edit: false, delete: false, scope: "none",
};

/** Compact constructor: g("vced", "all") — view, create, edit, delete. */
function g(flags: string, scope: Scope): Grant {
  return {
    view: flags.includes("v"),
    create: flags.includes("c"),
    edit: flags.includes("e"),
    delete: flags.includes("d"),
    scope,
  };
}

const ALL = g("vced", "all");

export const MATRIX: Record<GymRole, Partial<Record<Module, Grant>>> = {
  owner: Object.fromEntries(MODULES.map((m) => [m, ALL])) as Record<Module, Grant>,

  manager: {
    dashboard: g("v", "all"),
    members: ALL,
    memberships: ALL,
    payments: g("vc", "all"), // collect, not amend
    attendance: ALL,
    workouts: g("v", "all"),
    exercises: g("v", "all"),
    diet: g("v", "all"),
    progress: g("v", "all"),
    staff: g("v", "all"),
    leads: ALL,
    messaging: ALL,
    reports: g("v", "all"),
    settings: g("ve", "all"),
  },

  trainer: {
    dashboard: g("v", "assigned"),
    members: g("v", "assigned"),
    attendance: g("v", "assigned"),
    workouts: g("vced", "assigned"),
    exercises: g("vce", "all"),
    diet: g("vc", "assigned"),
    progress: g("vce", "assigned"),
    messaging: g("vc", "assigned"),
    reports: g("v", "own"),
  },

  receptionist: {
    dashboard: g("v", "all"),
    members: g("vc", "all"),
    memberships: g("vce", "all"),
    payments: g("vc", "all"),
    attendance: g("vc", "all"),
    exercises: g("v", "all"),
    leads: ALL,
    messaging: g("v", "all"),
  },

  nutritionist: {
    dashboard: g("v", "assigned"),
    members: g("v", "assigned"),
    exercises: g("v", "all"),
    diet: ALL,
    progress: g("v", "assigned"),
    messaging: g("vc", "assigned"),
  },

  member: {
    dashboard: g("v", "own"),
    members: g("ve", "own"),
    memberships: g("v", "own"),
    payments: g("vc", "own"),
    attendance: g("vc", "own"),
    workouts: g("ve", "own"), // log, not author
    exercises: g("v", "all"),
    diet: g("v", "own"),
    progress: g("vce", "own"),
    messaging: g("vc", "own"),
    settings: g("ve", "own"),
  },
};

export function grantFor(role: GymRole, module: Module): Grant {
  return MATRIX[role]?.[module] ?? NONE;
}

export function can(role: GymRole, module: Module, action: Action): boolean {
  return grantFor(role, module)[action];
}

export function scopeOf(role: GymRole, module: Module): Scope {
  return grantFor(role, module).scope;
}

/** True when the role sees every record in the gym, not just its own or its
 *  assigned clients. Mirrors the `scope = 'all'` check the RLS generator
 *  applies — useful for deciding between a list view and a single-record view. */
export function seesWholeGym(role: GymRole, module: Module): boolean {
  const grant = grantFor(role, module);
  return grant.view && grant.scope === "all";
}

/* ── surfaces ─────────────────────────────────────────────────────────────── */

/** Which of the three apps a role lands in after sign-in. */
export type Surface = "admin" | "trainer" | "member";

const SURFACE: Record<GymRole, Surface> = {
  owner: "admin",
  manager: "admin",
  receptionist: "admin",
  trainer: "trainer",
  nutritionist: "trainer", // shares the client-management shell
  member: "member",
};

export const SURFACE_HOME: Record<Surface, string> = {
  admin: "/admin",
  trainer: "/trainer",
  member: "/m",
};

export function surfaceFor(role: GymRole): Surface {
  return SURFACE[role];
}

export function homeFor(role: GymRole): string {
  return SURFACE_HOME[surfaceFor(role)];
}

/** Route prefix → surface, for proxy.ts. Order matters: longest first. */
export function surfaceForPath(pathname: string): Surface | null {
  if (pathname === "/admin" || pathname.startsWith("/admin/")) return "admin";
  if (pathname === "/trainer" || pathname.startsWith("/trainer/")) return "trainer";
  if (pathname === "/m" || pathname.startsWith("/m/")) return "member";
  return null;
}
