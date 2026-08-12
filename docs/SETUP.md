# Setup

Everything needed to get the project running, in order. Steps marked
**(you)** need an account or a card and cannot be done from the codebase.

---

## 0. Prerequisites

**Node 22 LTS or newer — required, not advisory.**

`@supabase/supabase-js` declares `node >= 22`, and on Node 20 its realtime
client throws at import (`Node.js detected but native WebSocket not found`) —
global `WebSocket` only became stable in Node 22. Node 20 also reached
end-of-life in April 2026.

```bash
node --version    # must print v22.x or newer
```

Install from [nodejs.org](https://nodejs.org) (LTS), or use a version manager
so you can hold several runtimes:

```powershell
winget install CoreyButler.NVMforWindows
nvm install 22
nvm use 22
```

---

## 1. Install and verify

```bash
npm install
npm run verify     # typecheck + lint + both CI guards + the isolation suite
```

`npm run verify` needs no database and no cloud account. The tenant-isolation
suite boots Postgres in-process via PGlite and applies the real migration files,
so it runs anywhere Node runs — including CI, with no Docker.

---

## 2. Supabase project **(you)**

1. Create a project at [supabase.com](https://supabase.com) — **region
   `ap-south-1` (Mumbai)**. Latency, not law: DPDP has no blanket localisation
   mandate, but every user is in India.
2. **Pro plan, $25/mo.** Not optional once a real gym is on it: the Free tier
   has *no backups at all*, and this database holds member and payment records.
3. Copy the URL and anon key into `.env.local` (see `.env.example`).
4. Push the schema:

   ```bash
   npx supabase link --project-ref YOUR-PROJECT-REF
   npm run db:push
   ```

5. **Enable the access token hook** — without this every JWT lacks `gym_id`,
   every policy compares against null, and the app reads nothing:

   Dashboard → Authentication → Hooks → *Customize Access Token* →
   Postgres function → `public.custom_access_token_hook`.

   (Still labelled Beta by Supabase. Use the Postgres-function form, not HTTP —
   an HTTP hook adds a network round trip to every token issuance.)

6. Set JWT expiry to **15–30 minutes**: Authentication → Sessions. Role changes
   only take effect on refresh, so a demoted manager keeps their old rights
   until then.

7. Generate types whenever the schema changes:

   ```bash
   npm run db:types
   ```

### Verifying the hook actually fired

Sign in, then in the browser console:

```js
const { data } = await supabase.auth.getClaims();
console.log(data.claims.app_metadata);   // { gym_id: "...", gym_role: "owner" }
```

Empty `app_metadata` means the hook is not enabled, or the user has no active
`gym_users` row.

---

## 3. Netlify **(you)**

1. Connect the GitHub repo. `netlify.toml` sets Node 22 and the build command.
2. Add the same environment variables in Site settings → Environment variables.
   Set them for **all** contexts, and point deploy previews at a *separate*
   Supabase project — a preview build against production data is a live gym's
   records one bad migration away from harm.
3. Netlify Free permits commercial use, and its 300 build-minutes/month is
   roughly 60–80 deploys. Move to Vercel Pro when there's revenue.

---

## 4. Later milestones **(you)**

None of these block M0–M2. Each has lead time, so start the paperwork early.

| Milestone | What to set up | Lead time |
|---|---|---|
| M3 | **Meta Tech Provider** — app review for `whatsapp_business_management`, then Embedded Signup so each gym gets its own WABA | weeks |
| M3 | **DLT registration** for SMS — ~₹5,900 + GST, TRAI-approved platform | 7–21 working days |
| M3 | **Resend** domain verification | hours |
| M4 | **Razorpay Partner** — onboard as a *Service* partner, then request *Technology* partner status for sub-merchant APIs | days, discretionary |
| M5 | **Cloudflare R2** bucket for exercise video and nightly `pg_dump` | minutes |

Four questions to answer in writing before they block you:

1. **TRAI/DLT** — may one platform entity send SMS on behalf of client gyms
   under its own header? Ask MSG91 compliance. If not, per-gym registration
   kills self-serve signup and gym-branded SMS becomes a paid add-on.
2. **Meta** — the shared-WABA shortcut is not clearly permitted; Tech Provider
   + Embedded Signup is. Confirm before designing onboarding.
3. **Razorpay** — will they grant Technology Partner status to a solo-founder
   SaaS, and are sub-merchant webhooks separate or multiplexed?
4. **MSG91 rate** — published quotes range ₹0.15–0.25/SMS. Get it in writing.

---

## 5. Operational musts

- **Restore drill before the second gym signs.** Supabase Pro keeps daily
  backups for 7 days; PITR is a $100/mo add-on and out of budget, so a bad
  migration at 16:00 costs up to 16 hours. Add a nightly `pg_dump` to R2 and
  restore it into a scratch project once, for real. A backup you have never
  restored is not a backup.
- **Cron liveness.** Sentry's free plan monitors one cron; there are twelve
  jobs. Point the rest at healthchecks.io. A silently dead reminder job costs a
  gym its renewals before anyone notices.
- **Meter WhatsApp per tenant from day one.** Marketing templates cost
  ₹0.86–1.09 each. One gym broadcasting to 5,000 members spends ₹4,300 in an
  afternoon. Retrofitting a usage meter into a live billing relationship is
  painful; make broadcasts wallet-funded.

---

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Dev server |
| `npm run verify` | typecheck + lint + guards + tests — run before every push |
| `npm test` | Tenant isolation suite (in-process Postgres, no Docker) |
| `npm run guard:rls` | Static check: every table has RLS and `gym_id` |
| `npm run guard:service-role` | Fails if the service role escapes `lib/db/admin.ts` |
| `npm run db:push` | Apply migrations to the linked project |
| `npm run db:types` | Regenerate `lib/db/database.types.ts` |
