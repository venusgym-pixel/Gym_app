# Setup — your 30 minutes

Everything that can be built without your accounts is built. What remains is
configuration. Follow this top to bottom and you should have a working gym you
can sign into.

Nothing here is guesswork on your part: each step says what to click, what to
paste, and how to tell it worked.

---

## Before you start — the one true prerequisite

**Node 22 LTS or newer.**

`@supabase/supabase-js` declares `node >= 22`, and on Node 20 its realtime
client throws at import (`Node.js detected but native WebSocket not found`) —
global `WebSocket` only became stable in Node 22. Node 20 also reached
end-of-life in April 2026.

```bash
node --version     # must print v22.x or newer
```

If it prints v20, install from [nodejs.org](https://nodejs.org) (LTS) or:

```powershell
winget install CoreyButler.NVMforWindows
nvm install 22
nvm use 22
```

Then:

```bash
npm install
npm run verify
```

`verify` runs typecheck, lint, both CI guards and 61 tests. It needs no cloud
account — the database tests boot Postgres in-process. **If this is green, the
whole business layer already works**; everything below is plumbing it to a real
project.

---

## 1 · Supabase project · ~5 min

1. [supabase.com](https://supabase.com) → New project.
   - **Region: `ap-south-1` (Mumbai)** — latency, not law. DPDP has no blanket
     localisation mandate, but every user is in India.
   - **Plan: Pro, $25/mo.** Not optional once a real gym is on it: the Free
     tier has *no backups at all*, and this database holds member and payment
     records.
2. Settings → API. Copy into `.env.local` (start from `.env.example`):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
3. Generate a cron secret and paste it as `CRON_SECRET`:

   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

---

## 2 · Push the schema · ~3 min

```bash
npx supabase login
npx supabase link --project-ref YOUR-PROJECT-REF
npm run db:push
npm run db:types          # regenerates lib/db/database.types.ts from the real DB
```

**Verify:** Table editor should show 18 tables, every one with a `gym_id`
column except `gyms`, `profiles` and `role_permissions`.

---

## 3 · Enable the access token hook · ~2 min

**Skip this and nothing works.** Without it every JWT lacks `gym_id`, every RLS
policy compares against null, and the app reads zero rows while looking
perfectly healthy.

Dashboard → **Authentication → Hooks → Customize Access Token** →
select **Postgres function** → `public.custom_access_token_hook` → Save.

While you're there: **Authentication → Sessions → JWT expiry = 1800** (30 min).
Role changes only take effect on refresh, so a demoted manager keeps their old
rights until then.

---

## 4 · Create your gym · ~2 min

```bash
npm run bootstrap -- --name "Fitwell Koramangala" --owner you@yourdomain.in --demo
```

This creates the gym, your owner account, the three plans from the design
board, the seven-step reminder ladder with templates, a reception kiosk, and
(with `--demo`) six members spread across active, expiring and lapsed so the
dashboard has something real to render.

It prints a generated password. Change it at `/set-password` after first login.

Idempotent — safe to re-run.

---

## 5 · Run it · ~1 min

```bash
npm run dev
```

Sign in at <http://localhost:3000/login> with the email and password above.
An owner lands on `/admin`, a trainer on `/trainer`, a member on `/m`.

### Confirm the hook actually fired

Browser console, once signed in:

```js
const { data } = await window.supabase.auth.getClaims();
console.log(data.claims.app_metadata);   // { gym_id: "…", gym_role: "owner" }
```

Empty `app_metadata` means step 3 was missed, or the user has no `gym_users`
row. Those are the only two causes.

---

## 6 · Schedule the jobs · ~5 min

The twelve logical jobs run as three pg_cron entries. Run this in the SQL
editor, substituting your deployed URL and the `CRON_SECRET` from step 1:

```sql
select cron.schedule('fitwell-daily', '30 3 * * *', $$
  select net.http_post(
    url     := 'https://YOUR-SITE/api/jobs/daily',
    headers := jsonb_build_object('x-cron-secret', 'YOUR_CRON_SECRET')
  );
$$);

select cron.schedule('fitwell-drain', '*/2 * * * *', $$
  select net.http_post(
    url     := 'https://YOUR-SITE/api/jobs/drain',
    headers := jsonb_build_object('x-cron-secret', 'YOUR_CRON_SECRET')
  );
$$);

select cron.schedule('fitwell-hourly', '0 * * * *', $$
  select net.http_post(
    url     := 'https://YOUR-SITE/api/jobs/hourly',
    headers := jsonb_build_object('x-cron-secret', 'YOUR_CRON_SECRET')
  );
$$);
```

`30 3 * * *` UTC is 09:00 Asia/Kolkata, the default gym reminder hour.

**Test the loop without waiting a day** — this is the whole revenue engine, so
prove it now:

```sql
-- a membership about to hit the 7-day rung
update memberships set expires_on = current_date + 7 where id = '<some-id>';
select job_daily();                                  -- queues the reminders
select rule_key, channel, status, body from notification_outbox;
```

With no WhatsApp credentials the drain worker uses a logging adapter: messages
are marked sent and printed to the server log. **The entire ladder is testable
before you create a single external account.**

---

## 7 · Deploy · ~5 min

1. Netlify → Add new site → import the GitHub repo. `netlify.toml` already sets
   Node 22 and the build command.
2. Site settings → Environment variables: add the same four from step 1, for
   **all** contexts.
3. Point deploy previews at a *separate* Supabase project. A preview build
   against production is a live gym's records one bad migration away from harm.

Netlify Free permits commercial use (Vercel's Hobby plan does not, and its
crons cap at once per day, which cannot run the drain worker). Move to Vercel
Pro when there's revenue.

---

## Later — start the paperwork early

None of these block anything above. All have lead time.

| When | What | Lead time |
|---|---|---|
| Before WhatsApp goes live | **Meta Tech Provider** — app review for `whatsapp_business_management`, then Embedded Signup so each gym gets its own WABA | weeks |
| Before SMS fallback | **DLT registration** — ~₹5,900 + GST on a TRAI-approved platform | 7–21 working days |
| Before online payments | **Razorpay Partner** — onboard as a *Service* partner, then request *Technology* partner status for sub-merchant APIs | days, discretionary |
| Before exercise video | **Cloudflare R2** bucket (also takes the nightly `pg_dump`) | minutes |

Four questions to get answered **in writing** before they block you:

1. **TRAI/DLT** — may one platform entity send SMS for client gyms under its own
   header? Ask MSG91 compliance. If not, per-gym registration kills self-serve
   signup and gym-branded SMS becomes a paid add-on.
2. **Meta** — Tech Provider + Embedded Signup is unambiguously fine; the
   shared-WABA shortcut is not. Confirm before designing onboarding.
3. **Razorpay** — will they grant Technology Partner status to a solo-founder
   SaaS, and are sub-merchant webhooks separate or multiplexed?
4. **MSG91 rate** — published quotes range ₹0.15–0.25/SMS. Get a volume quote.

---

## Operational musts

- **Restore drill before the second gym signs.** Supabase Pro keeps daily
  backups for 7 days; PITR is a $100/mo add-on and out of budget, so a bad
  migration at 16:00 costs up to 16 hours. Add a nightly `pg_dump` to R2 and
  restore it into a scratch project once, for real. A backup you have never
  restored is not a backup.
- **Cron liveness.** Sentry's free plan monitors one cron; there are three
  entries. Point the rest at healthchecks.io. A silently dead drain worker
  costs a gym its renewals before anyone notices.
- **Meter WhatsApp per tenant from day one.** Marketing templates cost
  ₹0.86–1.09 each. One gym broadcasting to 5,000 members spends ₹4,300 in an
  afternoon. Make broadcasts wallet-funded — retrofitting a usage meter into a
  live billing relationship is painful.

---

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Dev server |
| `npm run verify` | typecheck + lint + guards + 61 tests — run before every push |
| `npm run bootstrap` | Create a gym, owner, plans, reminder ladder, kiosk |
| `npm test` | Business-logic suite (in-process Postgres, no Docker) |
| `npm run guard:rls` | Static check: every table has RLS and `gym_id` |
| `npm run guard:service-role` | Fails if the service role escapes `lib/db/admin.ts` |
| `npm run db:push` | Apply migrations to the linked project |
| `npm run db:types` | Regenerate `lib/db/database.types.ts` |

---

## If something is wrong

| Symptom | Cause |
|---|---|
| App loads but every list is empty | Access token hook not enabled (step 3) |
| `WebSocket not found` at startup | Node 20 — upgrade to 22 |
| Redirected to `/no-access` | Signed in, but no `gym_users` row — re-run bootstrap |
| `npm run bootstrap` says missing env | `.env.local` not created, or `SUPABASE_SERVICE_ROLE_KEY` blank |
| Reminders never queue | `job_daily()` not scheduled, or every membership is outside the ladder's exact day offsets |
| Reminders queue but never send | Drain cron not scheduled, or `CRON_SECRET` mismatch → the endpoint returns 401 |
