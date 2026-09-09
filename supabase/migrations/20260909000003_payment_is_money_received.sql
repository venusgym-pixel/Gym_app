-- A payment row records the money that changed hands.
--
-- It did not. `amount_paise` was the plan's price excluding GST, while what
-- actually left the member's bank was that plus 18%. So a ₹8,500 plan showed
-- ₹10,030 on the desk screen, ₹10,030 on the invoice, ₹10,030 on the bank
-- statement — and ₹8,500 in the payments table.
--
-- The damage was worst exactly where it mattered most. Reception approving a
-- member's screenshot is asked "I found ₹8,500 in the gym's account", against
-- a statement that says ₹10,030; the one human check in the whole flow was
-- comparing the wrong number. The member app made the same mistake in the
-- other direction, listing a plan at ₹10,030 and then telling them to pay
-- ₹8,500 — two different prices for the same plan, one screen apart.
--
-- Nothing is lost by storing the gross: the net is still on the invoice as
-- taxable_paise. It was the gross that could not be recovered, because it
-- depended on a rate nobody recorded.
--
-- For a gym with GST switched off the two figures are the same number and
-- none of this is visible, which is the point — one rule, and the toggle is
-- the only thing that decides.

/* The rate, in one place. issue_invoice() keeps its own parameter so a caller
   can still ask for a different one; this is the answer to "what will a
   member actually be charged", which is a question about the gym rather than
   about the caller. Both read gst_enabled, and both have to move together if
   the statutory rate ever changes. */
create or replace function public.gym_gst_rate(p_gym_id uuid)
returns numeric
language sql
stable
set search_path = ''
as $fn$
  select case when g.gst_enabled then 0.18 else 0 end
    from public.gyms g where g.id = p_gym_id;
$fn$;

comment on function public.gym_gst_rate(uuid) is
  'The GST rate this gym charges: 0.18, or 0 when it is not registered.';

create or replace function public.gross_paise(p_gym_id uuid, p_taxable bigint)
returns bigint
language sql
stable
set search_path = ''
as $fn$
  select p_taxable
       + round(p_taxable * coalesce(public.gym_gst_rate(p_gym_id), 0))::bigint;
$fn$;

comment on function public.gross_paise(uuid, bigint) is
  'What the member hands over: the taxable value plus whatever tax this gym '
  'charges. Mirrors gstSplit() in lib/money.ts.';

grant execute on function public.gym_gst_rate(uuid) to authenticated;
grant execute on function public.gross_paise(uuid, bigint) to authenticated;


-- ── the two writers ─────────────────────────────────────────────────────────

/* A member says they have paid. The claimed amount is not evidence — nobody
   typed it, it is the price of the plan they tapped — but it is now the same
   figure their bank shows, which is what makes reception's comparison mean
   something. */
create or replace function claim_payment(
  p_gym_id     uuid,
  p_member_id  uuid,
  p_plan_id    uuid,
  p_method     payment_method,
  p_proof_path text,
  p_reference  text default null
)
returns uuid
language plpgsql
set search_path = ''
as $fn$
declare
  v_price bigint;
  v_id    uuid;
begin
  select price_paise into v_price
    from public.plans where id = p_plan_id and gym_id = p_gym_id;
  if v_price is null then raise exception 'unknown plan'; end if;

  insert into public.payments
    (gym_id, member_id, amount_paise, method, status,
     proof_path, proof_kind, reference, claimed_by)
  values
    (p_gym_id, p_member_id, public.gross_paise(p_gym_id, v_price),
     p_method, 'awaiting_verification',
     p_proof_path,
     case when p_method = 'cash' then 'cash_receipt' else 'upi_screenshot' end,
     p_reference, (select auth.uid()))
  returning id into v_id;

  return v_id;
end;
$fn$;


/*
  The money moment: record a payment, extend the membership, issue the invoice.

  Only the payment amount changes here. The membership still snapshots the
  plan's own price — that column exists so a later price rise is not
  retroactive, and it is the price of the thing sold rather than the cash
  collected. The invoice is still issued on the taxable value and works the
  tax out for itself from the gym.
*/
create or replace function record_payment_and_extend(
  p_gym_id      uuid,
  p_member_id   uuid,
  p_plan_id     uuid,
  p_method      payment_method,
  p_reference   text default null,
  p_recorded_by uuid default null,
  p_gateway_payment_id text default null,
  p_today       date default current_date,
  p_existing_payment_id uuid default null
)
returns table (payment_id uuid, membership_id uuid, invoice_id uuid, expires_on date)
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_plan     public.plans%rowtype;
  v_current  public.memberships%rowtype;
  v_expires  date;
  v_start    date;
  v_gross    bigint;
  v_pay_id   uuid;
  v_ms_id    uuid;
  v_inv_id   uuid;
begin
  select * into v_plan from public.plans p
   where p.id = p_plan_id and p.gym_id = p_gym_id;
  if not found then
    raise exception 'record_payment_and_extend: plan % not in gym %', p_plan_id, p_gym_id;
  end if;

  v_gross := public.gross_paise(p_gym_id, v_plan.price_paise);

  -- Replayed gateway webhook: return what already happened, change nothing.
  if p_gateway_payment_id is not null then
    select p.id into v_pay_id from public.payments p
     where p.gym_id = p_gym_id and p.gateway_payment_id = p_gateway_payment_id;
    if found then
      return query
        select p.id, p.membership_id,
               (select i.id from public.invoices i where i.payment_id = p.id limit 1),
               (select m.expires_on from public.memberships m where m.id = p.membership_id)
          from public.payments p where p.id = v_pay_id;
      return;
    end if;
  end if;

  /*
    The most recent term, live OR lapsed. A lapsed one still matters: it is
    what the new term links back to, and a win-back three weeks after expiry
    must still show up as a renewal rather than as a brand-new member.
  */
  select * into v_current
    from public.memberships m
   where m.member_id = p_member_id
     and m.gym_id = p_gym_id
     and m.status <> 'cancelled'
   order by m.expires_on desc
   limit 1;

  -- next_expiry() already clamps a past expiry to today, so this is correct
  -- for both early renewal (extends the tail) and win-back (starts today).
  v_expires := public.next_expiry(v_current.expires_on, v_plan.duration_days, p_today);

  if p_existing_payment_id is not null then
    update public.payments
       set status = 'paid',
           paid_at = now(),
           amount_paise = v_gross,
           recorded_by = coalesce(recorded_by, p_recorded_by)
     where id = p_existing_payment_id
     returning id into v_pay_id;
    if v_pay_id is null then raise exception 'payment % not found', p_existing_payment_id; end if;
  else
    insert into public.payments
      (gym_id, member_id, amount_paise, method, status, paid_at,
       reference, recorded_by, gateway_payment_id)
    values
      (p_gym_id, p_member_id, v_gross, p_method, 'paid', now(),
       p_reference, p_recorded_by, p_gateway_payment_id)
    returning id into v_pay_id;
  end if;

  /*
    One row per TERM, not one row per member.

    Extending the existing row in place would be simpler, but it overwrites
    started_on and expires_on — and the previous term's dates are exactly what
    the member profile's renewal history (A-04) has to show.
  */
  if v_current.id is not null then
    v_start := greatest(p_today, v_current.expires_on + 1);
    if v_current.status in ('pending', 'active', 'expiring', 'frozen') then
      update public.memberships
         set status = 'expired', updated_at = now()
       where id = v_current.id;
    end if;
  else
    v_start := p_today;
  end if;

  insert into public.memberships
    (gym_id, member_id, plan_id, status, started_on, expires_on,
     price_paise, renewed_from)
  values
    (p_gym_id, p_member_id, p_plan_id, 'active', v_start, v_expires,
     v_plan.price_paise, v_current.id)
  returning id into v_ms_id;

  update public.payments set membership_id = v_ms_id where id = v_pay_id;

  v_inv_id := public.issue_invoice(
    p_gym_id, p_member_id, v_pay_id, v_ms_id,
    v_plan.price_paise, v_plan.name || ' membership', 0.18, false, p_today);

  return query select v_pay_id, v_ms_id, v_inv_id, v_expires;
end;
$fn$;


-- ── history ─────────────────────────────────────────────────────────────────
--
-- Rows written before this migration hold the taxable value. The invoice next
-- to each one already knows what was really collected, so the correction is
-- exact rather than a re-derivation from a rate that may since have changed.

update public.payments p
   set amount_paise = i.total_paise
  from public.invoices i
 where i.payment_id = p.id
   and not i.is_credit_note
   and p.amount_paise <> i.total_paise;
