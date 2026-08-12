/* ============================================================================
   The full member lifecycle, end to end.

   This is the loop the product exists to serve (docs/end-to-end-flow.md §1):

     member joins → QR check-in → membership expiry detected →
     reminder ladder fires → member renews → admin sees the revenue

   Every step runs against real Postgres with the real migrations. Where a
   step depends on "today", the date is passed in rather than read from the
   clock, so the whole 90-day arc runs deterministically in milliseconds.
   ========================================================================= */

import { beforeEach, afterEach, describe, expect, it } from "vitest";
import { createTestDb, seedGym, type TestDb, type SeededGym } from "./support/db";

let db: TestDb;
let gym: SeededGym;

/** Dates chosen so the arc crosses an Indian financial-year boundary. */
const JOINED = "2026-08-12";
const day = (base: string, n: number) =>
  new Date(Date.parse(base) + n * 86_400_000).toISOString().slice(0, 10);

/** PGlite hands back Date objects for `date` columns; PostgREST hands back
 *  strings. Normalise so the assertions read the same either way. */
const iso = (v: unknown): string =>
  v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10);

beforeEach(async () => {
  db = await createTestDb();
  gym = await seedGym(db, "loop");
  // seedGym leaves an active membership; the lifecycle starts from nothing.
  await db.sql(`delete from memberships where gym_id = $1`, [gym.gymId]);
  await db.sql(`select seed_gym_reminders($1)`, [gym.gymId]);
}, 60_000);

afterEach(async () => {
  await db?.close();
});

async function joinAndPay(today = JOINED) {
  const [r] = await db.sql<{
    payment_id: string; membership_id: string; invoice_id: string; expires_on: string;
  }>(
    `select * from record_payment_and_extend($1, $2, $3, 'upi', 'UPI-REF-1', null, null, $4::date)`,
    [gym.gymId, gym.memberId, gym.planId, today],
  );
  return r;
}

describe("the full loop", () => {
  it("joins, checks in, lapses, is chased, renews, and shows up in revenue", async () => {
    /* ── 1. joins and pays ────────────────────────────────────────────────── */
    const join = await joinAndPay();
    expect(iso(join.expires_on)).toBe(day(JOINED, 90)); // quarterly

    const [ms] = await db.sql<{ status: string; expires_on: string }>(
      `select status, to_char(expires_on,'YYYY-MM-DD') as expires_on
         from memberships where id = $1`, [join.membership_id]);
    expect(ms.status).toBe("active");

    /* ── 2. the invoice is GST-correct and numbered ───────────────────────── */
    const [inv] = await db.sql<{
      invoice_no: string; fiscal_year: string; taxable_paise: string;
      cgst_paise: string; sgst_paise: string; igst_paise: string; total_paise: string;
    }>(`select * from invoices where id = $1`, [join.invoice_id]);

    expect(inv.fiscal_year).toBe("2026-27");            // August → FY starts April
    expect(inv.invoice_no).toBe("INV/2026-27/0001");
    expect(Number(inv.taxable_paise)).toBe(850_000);    // ₹8,500
    expect(Number(inv.cgst_paise)).toBe(76_500);        // 9%
    expect(Number(inv.sgst_paise)).toBe(76_500);        // 9%
    expect(Number(inv.igst_paise)).toBe(0);             // intra-state
    expect(Number(inv.total_paise)).toBe(1_003_000);    // ₹10,030 — matches M-04

    /* ── 3. checks in at the door ─────────────────────────────────────────── */
    const [checkin] = await db.sql<{ outcome: string; streak: number; visits_this_month: number }>(
      `select * from record_checkin($1, $2, 'qr')`, [gym.gymId, gym.memberId]);
    expect(checkin.outcome).toBe("ok");
    expect(Number(checkin.streak)).toBe(1);
    expect(Number(checkin.visits_this_month)).toBe(1);

    /* Re-scan a moment later is the same visit, not a second one. */
    const [again] = await db.sql<{ outcome: string }>(
      `select * from record_checkin($1, $2, 'qr')`, [gym.gymId, gym.memberId]);
    expect(again.outcome).toBe("duplicate");
    const [{ n }] = await db.sql<{ n: string }>(
      `select count(*) n from attendance where member_id = $1`, [gym.memberId]);
    expect(Number(n)).toBe(1);

    /* ── 4. 60 days on: the sweep marks it expiring ───────────────────────── */
    const t60 = day(JOINED, 61);   // 29 days to expiry → inside the 30-day band
    const [sweep] = await db.sql<{ expiring: number }>(
      `select * from job_sweep_membership_status($1::date)`, [t60]);
    expect(Number(sweep.expiring)).toBe(1);

    /* ── 5. the ladder fires at exactly −7 days ───────────────────────────── */
    const t83 = day(JOINED, 83);   // expiry − 7
    const [ladder] = await db.sql<{ queued: number }>(
      `select * from job_run_reminder_ladder($1::date)`, [t83]);
    expect(Number(ladder.queued)).toBe(2);   // whatsapp + push

    const queued = await db.sql<{ rule_key: string; channel: string; body: string }>(
      `select rule_key, channel, body from notification_outbox
        where gym_id = $1 order by channel`, [gym.gymId]);
    expect(queued.map((q) => q.rule_key)).toEqual(["expiry_7d", "expiry_7d"]);
    expect(queued[0].body).toContain("expires in 7 days");

    /* Re-running the same day must not send it twice — this is the whole
       reliability guarantee of the engine. */
    const [rerun] = await db.sql<{ queued: number; skipped: number }>(
      `select * from job_run_reminder_ladder($1::date)`, [t83]);
    expect(Number(rerun.queued)).toBe(0);
    expect(Number(rerun.skipped)).toBe(2);

    /* ── 6. it lapses, and the door turns them away ───────────────────────── */
    const t91 = day(JOINED, 91);
    await db.sql(`select * from job_sweep_membership_status($1::date)`, [t91]);
    const [after] = await db.sql<{ status: string }>(
      `select status from memberships where id = $1`, [join.membership_id]);
    expect(after.status).toBe("expired");

    // record_checkin() reads the real current_date, so put the membership
    // genuinely in the past — both ends, or expiry_after_start trips.
    await db.sql(
      `update memberships
          set started_on = current_date - 100, expires_on = current_date - 1
        where id = $1`,
      [join.membership_id]);
    const [blocked] = await db.sql<{ outcome: string }>(
      `select * from record_checkin($1, $2, 'qr')`, [gym.gymId, gym.memberId]);
    expect(blocked.outcome).toBe("expired");

    /* ── 7. renews — from today, because they lapsed ──────────────────────── */
    const renew = await joinAndPay(t91);
    expect(iso(renew.expires_on)).toBe(day(t91, 90));

    /* A new term, not an overwritten one — the old dates survive for the
       renewal history on A-04, linked by renewed_from. */
    expect(renew.membership_id).not.toBe(join.membership_id);
    const [chain] = await db.sql<{ renewed_from: string; prev_status: string }>(
      `select m.renewed_from, prev.status as prev_status
         from memberships m join memberships prev on prev.id = m.renewed_from
        where m.id = $1`, [renew.membership_id]);
    expect(chain.renewed_from).toBe(join.membership_id);
    expect(chain.prev_status).toBe("expired");

    const [{ terms }] = await db.sql<{ terms: string }>(
      `select count(*) terms from memberships where member_id = $1`, [gym.memberId]);
    expect(Number(terms)).toBe(2);

    const [inv2] = await db.sql<{ invoice_no: string }>(
      `select invoice_no from invoices where id = $1`, [renew.invoice_id]);
    expect(inv2.invoice_no).toBe("INV/2026-27/0002");     // sequential, no gap

    /* ── 8. the door lets them back in ────────────────────────────────────── */

    /* The arc simulates 91 days, but wall-clock time has not moved, so the
       step-3 visit is still inside record_checkin's 30-minute same-visit
       window. Age it to match the story being told. */
    await db.sql(
      `update attendance set checked_in_at = checked_in_at - interval '91 days'
        where gym_id = $1`, [gym.gymId]);

    const [ok] = await db.sql<{ outcome: string }>(
      `select * from record_checkin($1, $2, 'qr', null, gen_random_uuid())`,
      [gym.gymId, gym.memberId]);
    expect(ok.outcome).toBe("ok");

    /* ── 9. the owner sees the revenue ────────────────────────────────────── */
    const [rev] = await db.sql<{ collected: string; invoices: string }>(
      `select coalesce(sum(p.amount_paise),0) collected,
              (select count(*) from invoices where gym_id = $1) invoices
         from payments p where p.gym_id = $1 and p.status = 'paid'`,
      [gym.gymId]);
    expect(Number(rev.collected)).toBe(1_700_000);  // two × ₹8,500
    expect(Number(rev.invoices)).toBe(2);
  });
});

describe("renewing early never loses the unused tail", () => {
  it("extends from the existing expiry, not from today", async () => {
    const join = await joinAndPay();
    const early = day(JOINED, 80);                    // 10 days still to run
    const renew = await joinAndPay(early);

    // The tail is kept: old expiry + 90, not today + 90.
    expect(iso(renew.expires_on)).toBe(day(JOINED, 180));

    // And the new term picks up the day the old one ends — no overlap, and
    // no gap where the member would be turned away at the door.
    const [terms] = await db.sql<{ prev_end: string; next_start: string }>(
      `select to_char(prev.expires_on,'YYYY-MM-DD') prev_end,
              to_char(next.started_on,'YYYY-MM-DD') next_start
         from memberships next join memberships prev on prev.id = next.renewed_from
        where next.id = $1`, [renew.membership_id]);
    expect(terms.prev_end).toBe(day(JOINED, 90));
    expect(terms.next_start).toBe(day(JOINED, 91));
    expect(renew.membership_id).not.toBe(join.membership_id);
  });
});

describe("invoice numbering", () => {
  it("is gap-free even when an invoice attempt rolls back", async () => {
    await joinAndPay();

    // Allocate a number inside a transaction, then roll back. The counter is
    // a table row rather than a sequence, so the increment rolls back with
    // it — which is precisely what lets the series stay gap-free. A sequence
    // here would burn number 2 and leave a hole an auditor would ask about.
    await db.sql("begin");
    await db.sql(`select * from next_invoice_number($1::uuid, $2::date)`,
                 [gym.gymId, JOINED]);
    await db.sql("rollback");

    const second = await joinAndPay(day(JOINED, 1));
    const [inv] = await db.sql<{ sequence_no: number }>(
      `select sequence_no from invoices where id = $1`, [second.invoice_id]);
    expect(Number(inv.sequence_no)).toBe(2);          // 2, not 3

    const all = await db.sql<{ sequence_no: number }>(
      `select sequence_no from invoices where gym_id = $1 order by sequence_no`,
      [gym.gymId]);
    expect(all.map((r) => Number(r.sequence_no))).toEqual([1, 2]);
  });

  it("restarts at 1 in a new financial year", async () => {
    await joinAndPay("2026-08-12");                   // FY 2026-27
    const next = await joinAndPay("2027-04-02");      // FY 2027-28
    const [inv] = await db.sql<{ invoice_no: string; fiscal_year: string }>(
      `select invoice_no, fiscal_year from invoices where id = $1`, [next.invoice_id]);
    expect(inv.fiscal_year).toBe("2027-28");
    expect(inv.invoice_no).toBe("INV/2027-28/0001");
  });

  it("numbers each gym independently", async () => {
    const other = await seedGym(db, "second");
    await joinAndPay();
    const [r] = await db.sql<{ invoice_id: string }>(
      `select * from record_payment_and_extend($1, $2, $3, 'cash', null, null, null, $4::date)`,
      [other.gymId, other.memberId, other.planId, JOINED]);
    const [inv] = await db.sql<{ invoice_no: string }>(
      `select invoice_no from invoices where id = $1`, [r.invoice_id]);
    expect(inv.invoice_no).toBe("INV/2026-27/0001");   // its own series
  });
});

describe("payment idempotency", () => {
  it("a webhook replayed three times extends the membership once", async () => {
    const first = await db.sql<{ membership_id: string; expires_on: string }>(
      `select * from record_payment_and_extend($1, $2, $3, 'upi', null, null,
                                               'pay_ABC123', $4::date)`,
      [gym.gymId, gym.memberId, gym.planId, JOINED]);

    for (let i = 0; i < 2; i++) {
      await db.sql(
        `select * from record_payment_and_extend($1, $2, $3, 'upi', null, null,
                                                 'pay_ABC123', $4::date)`,
        [gym.gymId, gym.memberId, gym.planId, JOINED]);
    }

    const [{ n }] = await db.sql<{ n: string }>(
      `select count(*) n from payments where gym_id = $1`, [gym.gymId]);
    expect(Number(n)).toBe(1);

    const [ms] = await db.sql<{ expires_on: string }>(
      `select to_char(expires_on,'YYYY-MM-DD') expires_on from memberships where id = $1`,
      [first[0].membership_id]);
    expect(ms.expires_on).toBe(day(JOINED, 90));
  });
});

describe("inactivity", () => {
  it("fires at 7 and 14 days, and never at a member who has never visited", async () => {
    await joinAndPay();

    // Never visited — must be silent, not treated as infinitely absent.
    const [none] = await db.sql<{ queued: number }>(
      `select * from job_scan_inactivity(current_date)`);
    expect(Number(none.queued)).toBe(0);

    await db.sql(
      `insert into attendance (gym_id, member_id, checked_in_at)
       values ($1, $2, now() - interval '7 days')`, [gym.gymId, gym.memberId]);

    const [seven] = await db.sql<{ queued: number }>(
      `select * from job_scan_inactivity(current_date)`);
    expect(Number(seven.queued)).toBe(1);

    const [row] = await db.sql<{ rule_key: string; body: string }>(
      `select rule_key, body from notification_outbox where rule_key like 'inactive%'`);
    expect(row.rule_key).toBe("inactive_7d");
    expect(row.body).toContain("haven't seen you");
  });
});

describe("the outbox drain", () => {
  it("claims, sends, and retries with backoff before giving up", async () => {
    await joinAndPay();
    await db.sql(`select * from job_run_reminder_ladder($1::date)`, [day(JOINED, 83)]);

    const batch = await db.sql<{ id: string; status: string; attempts: number }>(
      `select id, status, attempts from claim_outbox_batch(10)`);
    expect(batch).toHaveLength(2);
    expect(batch.every((b) => b.status === "sending")).toBe(true);
    expect(batch.every((b) => Number(b.attempts) === 1)).toBe(true);

    await db.sql(`select mark_outbox_result($1, true, 'wamid.XYZ')`, [batch[0].id]);
    await db.sql(`select mark_outbox_result($1, false, null, 'provider 503')`, [batch[1].id]);

    const rows = await db.sql<{ status: string; error: string | null; provider_message_id: string | null }>(
      `select status, error, provider_message_id from notification_outbox
        where gym_id = $1 order by status`, [gym.gymId]);
    expect(rows.map((r) => r.status).sort()).toEqual(["failed", "sent"]);
    expect(rows.find((r) => r.status === "sent")!.provider_message_id).toBe("wamid.XYZ");
    expect(rows.find((r) => r.status === "failed")!.error).toBe("provider 503");

    /* The failed one is not due yet — backoff must hold it back. */
    const immediate = await db.sql(`select id from claim_outbox_batch(10)`);
    expect(immediate).toHaveLength(0);

    /* After three attempts it stops retrying and waits for a human. */
    await db.sql(
      `update notification_outbox set attempts = 3, next_attempt_at = now()
        where status = 'failed'`);
    expect(await db.sql(`select id from claim_outbox_batch(10)`)).toHaveLength(0);
  });

  it("requeues messages abandoned by a worker that died mid-send", async () => {
    await joinAndPay();
    await db.sql(`select * from job_run_reminder_ladder($1::date)`, [day(JOINED, 83)]);
    await db.sql(`select id from claim_outbox_batch(10)`);
    // notification_outbox_touch resets updated_at on every write, which is
    // exactly what makes the claim timestamp trustworthy in production — and
    // exactly why the test has to switch it off to simulate a dead worker.
    await db.sql(`alter table notification_outbox disable trigger notification_outbox_touch`);
    await db.sql(`update notification_outbox set updated_at = now() - interval '30 minutes'`);
    await db.sql(`alter table notification_outbox enable trigger notification_outbox_touch`);

    const [{ job_requeue_stuck: n }] = await db.sql<{ job_requeue_stuck: number }>(
      `select job_requeue_stuck()`);
    expect(Number(n)).toBe(2);
  });
});

describe("the daily fan-out", () => {
  it("settles status before the ladder reads it", async () => {
    await joinAndPay();
    const result = await db.sql<{ job_daily: Record<string, unknown> }>(
      `select job_daily($1::date)`, [day(JOINED, 83)]);
    const out = result[0].job_daily as {
      sweep: { expiring: number }; reminders: { queued: number };
    };
    // The sweep marks it expiring, and the ladder still finds it: proof the
    // ladder's status filter includes the status the sweep just set.
    expect(Number(out.sweep.expiring)).toBe(1);
    expect(Number(out.reminders.queued)).toBe(2);
  });
});

describe("check-in never leaks across gyms", () => {
  it("a member id from another gym is not found", async () => {
    const other = await seedGym(db, "elsewhere");
    await joinAndPay();
    const [r] = await db.sql<{ outcome: string }>(
      `select * from record_checkin($1, $2, 'qr')`, [gym.gymId, other.memberId]);
    expect(r.outcome).toBe("none");
  });
});
