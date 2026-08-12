/* ============================================================================
   Bootstrap a gym.

   Creating the first gym is the one operation that cannot go through RLS:
   there is no gym_users row yet to grant anything, so there is no session
   that could be allowed to do it. "gym-onboarding" is one of the four
   sanctioned service-role uses in lib/db/admin.ts, and this script is listed
   by name in scripts/guard-service-role.ts.

     npm run bootstrap -- --name "Fitwell Koramangala" --owner you@gym.in
     npm run bootstrap -- --name "Demo Gym" --owner you@gym.in --demo

   Idempotent: re-running with the same slug tops up anything missing rather
   than creating a second gym.
   ========================================================================= */

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!URL || !KEY) {
  console.error(
    "\nMissing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.\n" +
      "Copy .env.example to .env.local and fill in the Supabase block first.\n",
  );
  process.exit(1);
}

/* ── args ─────────────────────────────────────────────────────────────────── */

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const gymName = arg("--name") ?? "Fitwell Koramangala";
const ownerEmail = arg("--owner");
const ownerPassword = arg("--password") ?? "changeme-" + crypto.randomUUID().slice(0, 8);
const withDemo = process.argv.includes("--demo");
const slug = (arg("--slug") ?? gymName)
  .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

if (!ownerEmail) {
  console.error("\n--owner <email> is required: it becomes the gym's first admin.\n");
  process.exit(1);
}

const db = createClient(URL, KEY, { auth: { persistSession: false } });

/* ── steps ────────────────────────────────────────────────────────────────── */

async function main() {
  console.log(`\nBootstrapping "${gymName}" (${slug})\n`);

  /* 1. the gym */
  const { data: existing } = await db
    .from("gyms").select("id").eq("slug", slug).maybeSingle();

  let gymId = (existing as { id: string } | null)?.id;

  if (gymId) {
    console.log("  gym          already exists, topping up");
  } else {
    const { data, error } = await db
      .from("gyms")
      .insert({
        name: gymName, slug,
        timezone: "Asia/Kolkata", currency: "INR", reminder_hour: 9,
        onboarding_state: "active",
      })
      .select("id").single();
    if (error) throw new Error(`gym: ${error.message}`);
    gymId = (data as { id: string }).id;
    console.log("  gym          created");
  }

  /* 2. the owner. createUser is idempotent-ish: a duplicate email errors, and
        we then look the existing user up rather than failing the whole run. */
  let ownerId: string;
  const created = await db.auth.admin.createUser({
    email: ownerEmail,
    password: ownerPassword,
    email_confirm: true,
  });

  if (created.data.user) {
    ownerId = created.data.user.id;
    console.log(`  owner        created — ${ownerEmail} / ${ownerPassword}`);
  } else {
    const { data: list } = await db.auth.admin.listUsers();
    const found = list.users.find((u) => u.email === ownerEmail);
    if (!found) throw new Error(`owner: ${created.error?.message}`);
    ownerId = found.id;
    console.log("  owner        already exists, reusing");
  }

  await db.from("profiles").upsert({
    id: ownerId, full_name: "Gym Owner", email: ownerEmail,
  });

  await db.from("gym_users").upsert(
    { gym_id: gymId, user_id: ownerId, role: "owner" },
    { onConflict: "gym_id,user_id" },
  );
  console.log("  membership   owner linked to gym");

  /* 3. plans — the three from the design board, priced in paise */
  const plans = [
    { name: "Monthly",   duration_days: 30,  price_paise: 320_000,   sort_order: 1 },
    { name: "Quarterly", duration_days: 90,  price_paise: 850_000,   sort_order: 2 },
    { name: "Annual",    duration_days: 365, price_paise: 2_800_000, sort_order: 3 },
  ].map((p) => ({ ...p, gym_id: gymId, freeze_days_allowed: 15 }));

  const { error: planErr } = await db
    .from("plans").upsert(plans, { onConflict: "gym_id,name" });
  if (planErr) throw new Error(`plans: ${planErr.message}`);
  console.log("  plans        Monthly / Quarterly / Annual");

  /* 4. the reminder ladder and its templates */
  const { error: seedErr } = await db.rpc("seed_gym_reminders", { p_gym_id: gymId });
  if (seedErr) throw new Error(`reminders: ${seedErr.message}`);
  console.log("  reminders    7-step ladder + templates");

  /* 5. the reception kiosk */
  const { data: kiosk } = await db
    .from("kiosk_devices").select("id").eq("gym_id", gymId).limit(1).maybeSingle();
  if (!kiosk) {
    await db.from("kiosk_devices").insert({ gym_id: gymId, name: "Reception" });
    console.log("  kiosk        Reception");
  }

  if (withDemo) await seedDemo(gymId!);

  console.log(`\nDone. Sign in at /login with ${ownerEmail}\n`);
  if (created.data.user) {
    console.log(`Password: ${ownerPassword}   (change it at /set-password)\n`);
  }
}

/* ── demo data ────────────────────────────────────────────────────────────── */

/**
 * Members spread across every membership state, so the dashboard and the
 * expiring worklist have something real to render. Without this the first
 * screen a new owner sees is eight empty cards.
 */
async function seedDemo(gymId: string) {
  const { data: plans } = await db
    .from("plans").select("id, name, duration_days, price_paise").eq("gym_id", gymId);
  const quarterly = (plans as { id: string; name: string }[] | null)
    ?.find((p) => p.name === "Quarterly");
  if (!quarterly) return;

  const people = [
    { name: "Rahul Sharma",  phone: "+919845021764", daysLeft: 23 },
    { name: "Arun Kumar",    phone: "+919845021765", daysLeft: 5 },
    { name: "Priya Nair",    phone: "+919845021766", daysLeft: 3 },
    { name: "Karthik Iyer",  phone: "+919845021767", daysLeft: 45 },
    { name: "Divya Menon",   phone: "+919845021768", daysLeft: -4 },  // lapsed
    { name: "Sanjay Rao",    phone: "+919845021769", daysLeft: 1 },
  ];

  let n = 0;
  for (const [i, p] of people.entries()) {
    const code = `M-${String(i + 1).padStart(3, "0")}`;

    const { data: member } = await db
      .from("members")
      .upsert(
        { gym_id: gymId, member_code: code, full_name: p.name, phone: p.phone },
        { onConflict: "gym_id,member_code" },
      )
      .select("id").single();
    if (!member) continue;

    const memberId = (member as { id: string }).id;
    const expires = new Date(Date.now() + p.daysLeft * 86_400_000);
    const started = new Date(expires.getTime() - 90 * 86_400_000);
    const iso = (d: Date) => d.toISOString().slice(0, 10);

    const { data: live } = await db
      .from("memberships").select("id").eq("member_id", memberId).limit(1).maybeSingle();

    if (!live) {
      await db.from("memberships").insert({
        gym_id: gymId, member_id: memberId, plan_id: quarterly.id,
        status: p.daysLeft < 0 ? "expired" : "active",
        started_on: iso(started), expires_on: iso(expires),
        price_paise: 850_000,
      });
    }

    /* Attendance history: a couple of visits each, and one member left
       deliberately absent so the inactivity scan has something to find. */
    if (p.daysLeft !== -4) {
      for (const ago of [1, 3, 6]) {
        await db.from("attendance").insert({
          gym_id: gymId, member_id: memberId, method: "qr",
          checked_in_at: new Date(Date.now() - ago * 86_400_000).toISOString(),
        });
      }
    }
    n++;
  }

  console.log(`  demo         ${n} members across active / expiring / lapsed`);
}

main().catch((e) => {
  console.error("\nBootstrap failed:", (e as Error).message, "\n");
  process.exit(1);
});
