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

## 7 · Deploy · ~10 min

**Cloudflare Workers**, not Netlify. Netlify Free was the original choice
because its terms permit commercial use where Vercel's Hobby plan does not.
It was measurably the wrong one from India: a 38KB immutable asset took
680–1140ms and came back `Cache-Status: fwd=miss` on *every* request — the
edge never cached it, so every byte round-tripped to a US origin, and the page
functions ran there too, crossing to Mumbai and back for each query.
Cloudflare answers from an Indian PoP in ~300ms and runs the worker there.

```bash
npx wrangler login          # opens a browser, once
npm run cf:preview          # build + run it locally at http://localhost:8787
npm run cf:deploy           # build + ship
```

Then set the secrets. These are **not** in `wrangler.jsonc` — that file is
committed. `.dev.vars` already holds exactly the four the worker needs, in
KEY=VALUE form, so upload the lot in one command:

```bash
npx wrangler secret bulk .dev.vars
```

**Do not delete `.env.local` afterwards.** The two files look redundant and
are not.

Cloudflare secrets are read at RUNTIME — by the middleware, the job endpoints
and the staff invite. But `NEXT_PUBLIC_*` values are also inlined into the
browser bundle at BUILD time, and `npm run cf:deploy` builds on your machine,
where the only source of them is `.env.local`. Build without it and you ship a
bundle pointing at `undefined` — which fails in the worst way: the server
renders every page correctly and every browser request dies.

So the same four values live in three places, each for a different reason:

| Where | Read when | Why |
|---|---|---|
| `.env.local` | `npm run build`, `cf:deploy` | inlines NEXT_PUBLIC_* into the client bundle |
| `.dev.vars` | `npm run cf:preview` | the local worker's runtime |
| Cloudflare secrets | the deployed worker | production runtime |

All three are gitignored; `wrangler.jsonc` is committed and holds no values.

**After the first deploy**, two things point at the old host and must move:

1. **Supabase → Authentication → URL Configuration.** Site URL and Redirect
   URLs (`https://YOUR-WORKER.workers.dev/**`), or `/verify` and
   `/set-password` will bounce people to the Netlify domain.
2. **The cron job's target.** It reads the URL from Vault, so this is one
   statement, not three:

   ```sql
   select vault.update_secret(
     (select id from vault.secrets where name = 'jobs_url'),
     'https://YOUR-WORKER.workers.dev/api/jobs'
   );
   ```

   Confirm within two minutes:

   ```sql
   select status, return_message, start_time
     from cron.job_run_details order by start_time desc limit 3;
   ```

### Why middleware.ts and not proxy.ts

Next 16 renamed the convention and pinned it to the Node runtime — the build
rejects route segment config there with *"Proxy always runs on Node.js
runtime"*. Cloudflare Workers cannot run Node middleware, so the OpenNext
build fails with *"Node.js middleware is not currently supported"*
([opennextjs-cloudflare#962](https://github.com/opennextjs/opennextjs-cloudflare/issues/962)).

`middleware.ts` still works in Next 16 — a deprecation warning, nothing more
— runs on the edge, and is what the adapter supports. Rename it back once
OpenNext lands Node middleware support. Nothing in that file needs Node.

### netlify.toml is still here

Deliberately. It is the fallback until Cloudflare has run a full billing cycle
without surprises, and it costs nothing to keep. Delete it once you are sure.

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
