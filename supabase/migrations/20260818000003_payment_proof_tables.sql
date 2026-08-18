-- ============================================================================
-- 0022 · Proof files, the UPI code, and the approval step.
-- ============================================================================

-- ── what a payment now carries ──────────────────────────────────────────────

alter table payments
  -- Storage path, not a URL: the bucket is private and every read is a
  -- short-lived signed link, so a stored URL would be dead within the hour.
  add column proof_path   text,
  add column proof_kind   text
    check (proof_kind is null or proof_kind in ('upi_screenshot', 'cash_receipt', 'other')),
  add column verified_by  uuid references profiles(id) on delete set null,
  add column verified_at  timestamptz,
  add column rejected_reason text,
  -- Set when a member claims the payment themselves, so the queue can show
  -- who is waiting and reception can tell it apart from their own entries.
  add column claimed_by   uuid references profiles(id) on delete set null;

comment on column payments.proof_path is
  'Object path in the payment-proofs bucket. Private: reads go through a '
  'signed URL, so nothing here is useful on its own.';

-- The verification queue is the hot query on the payments screen.
create index payments_awaiting_idx on payments (gym_id, created_at desc)
  where status = 'awaiting_verification';


-- ── the gym's UPI code ──────────────────────────────────────────────────────

alter table gyms
  add column upi_qr_path text,
  add column upi_vpa     text;

comment on column gyms.upi_vpa is
  'The UPI id shown as text beneath the QR. Some members type it rather than '
  'scan, and a QR that fails to scan should not be the end of the road.';


-- ── storage ─────────────────────────────────────────────────────────────────
--
-- Wrapped in a guard because the test harness runs these migrations against
-- PGlite, which has no storage schema. Without it the whole suite fails on a
-- bucket that only exists in Supabase.

do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then

    insert into storage.buckets (id, name, public)
    values ('payment-proofs', 'payment-proofs', false)
    on conflict (id) do nothing;

    /* Private, deliberately. A payment screenshot shows a member's name, the
       amount and often their bank — and a public bucket means a guessable URL
       is the only thing between that and the open internet. */
    insert into storage.buckets (id, name, public)
    values ('gym-public', 'gym-public', true)
    on conflict (id) do nothing;

    -- Proof files: staff of the owning gym only. The first path segment is
    -- the gym id, which is what ties an object to a tenant.
    drop policy if exists payment_proofs_read on storage.objects;
    create policy payment_proofs_read on storage.objects for select to authenticated
      using (
        bucket_id = 'payment-proofs'
        and (storage.foldername(name))[1] = (select public.auth_gym_id())::text
        and (select public.has_permission('payments', 'view'))
      );

    /* Members upload their own proof, so insert is NOT limited to staff —
       it is limited to their own gym's folder. A member with no payments
       permission can still put a file there, which is the point. */
    drop policy if exists payment_proofs_write on storage.objects;
    create policy payment_proofs_write on storage.objects for insert to authenticated
      with check (
        bucket_id = 'payment-proofs'
        and (storage.foldername(name))[1] = (select public.auth_gym_id())::text
      );

    -- The UPI QR is shown to every member, so it lives in the public bucket;
    -- only staff who can edit settings may replace it.
    drop policy if exists gym_public_write on storage.objects;
    create policy gym_public_write on storage.objects for insert to authenticated
      with check (
        bucket_id = 'gym-public'
        and (storage.foldername(name))[1] = (select public.auth_gym_id())::text
        and (select public.has_permission('settings', 'edit'))
      );

    drop policy if exists gym_public_update on storage.objects;
    create policy gym_public_update on storage.objects for update to authenticated
      using (
        bucket_id = 'gym-public'
        and (storage.foldername(name))[1] = (select public.auth_gym_id())::text
        and (select public.has_permission('settings', 'edit'))
      );
  end if;
end;
$$;


-- ── claiming a payment, without extending anything ──────────────────────────

/**
 * A member says they have paid, and attaches proof.
 *
 * Records the claim and nothing else: no membership extension, no invoice,
 * no money assumed. Everything that follows waits for a human, because the
 * only evidence at this point is a picture the member chose.
 *
 * SECURITY INVOKER — RLS decides whether this member may write a payment row
 * for themselves, and the self-payment policy below is what grants it.
 */
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
as $$
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
    (p_gym_id, p_member_id, v_price, p_method, 'awaiting_verification',
     p_proof_path,
     case when p_method = 'cash' then 'cash_receipt' else 'upi_screenshot' end,
     p_reference, (select auth.uid()))
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function claim_payment(uuid, uuid, uuid, payment_method, text, text)
  to authenticated;

/* Members may create a payment row for themselves and read their own. They
   may NOT set it to paid — approve_payment is definer and checks permission,
   and there is no update policy for members at all. */
create policy payments_member_claim on payments for insert to authenticated
  with check (
    gym_id = (select auth_gym_id())
    and status = 'awaiting_verification'
    and exists (
      select 1 from members m
      where m.id = payments.member_id and m.user_id = (select auth.uid())
    )
  );


-- ── approving it ────────────────────────────────────────────────────────────
--
-- Approval must produce EXACTLY ONE payment row, the same shape reception
-- would have created. The obvious implementation — call
-- record_payment_and_extend and mark the claim row superseded — leaves two
-- rows for one payment, and every revenue figure in the product sums payment
-- rows. So the existing function learns to finalise a row that already
-- exists instead of always inserting one.
--
-- Dropped and recreated rather than CREATE OR REPLACE: adding a parameter
-- changes the signature, which would leave two overloads and make every
-- existing call ambiguous.

drop function if exists record_payment_and_extend(
  uuid, uuid, uuid, payment_method, text, uuid, text, date);

create function record_payment_and_extend(
  p_gym_id      uuid,
  p_member_id   uuid,
  p_plan_id     uuid,
  p_method      payment_method,
  p_reference   text default null,
  p_recorded_by uuid default null,
  p_gateway_payment_id text default null,
  p_today       date default current_date,
  -- When set, this row is marked paid instead of a new one being inserted.
  -- That is what keeps an approved claim a single payment.
  p_existing_payment_id uuid default null
)
returns table (payment_id uuid, membership_id uuid, invoice_id uuid, expires_on date)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan     public.plans%rowtype;
  v_current  public.memberships%rowtype;
  v_expires  date;
  v_start    date;
  v_pay_id   uuid;
  v_ms_id    uuid;
  v_inv_id   uuid;
begin
  select * into v_plan from public.plans p
   where p.id = p_plan_id and p.gym_id = p_gym_id;
  if not found then
    raise exception 'record_payment_and_extend: plan % not in gym %', p_plan_id, p_gym_id;
  end if;

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
           amount_paise = v_plan.price_paise,
           recorded_by = coalesce(recorded_by, p_recorded_by)
     where id = p_existing_payment_id
     returning id into v_pay_id;
    if v_pay_id is null then raise exception 'payment % not found', p_existing_payment_id; end if;
  else
    insert into public.payments
      (gym_id, member_id, amount_paise, method, status, paid_at,
       reference, recorded_by, gateway_payment_id)
    values
      (p_gym_id, p_member_id, v_plan.price_paise, p_method, 'paid', now(),
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
$$;

grant execute on function record_payment_and_extend(
  uuid, uuid, uuid, payment_method, text, uuid, text, date, uuid) to authenticated;


/**
 * Turn a claimed payment into a real one.
 *
 * This is where the money becomes true — the membership extends and a
 * numbered GST invoice is issued, neither of which undoes cleanly. Hence a
 * human, and hence the permission check inside rather than trusting whoever
 * called it.
 */
create or replace function approve_payment(p_payment_id uuid, p_plan_id uuid)
returns table (membership_id uuid, invoice_id uuid, expires_on date)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pay public.payments%rowtype;
  v_res record;
begin
  select * into v_pay from public.payments where id = p_payment_id;
  if not found then raise exception 'payment not found'; end if;

  if v_pay.gym_id <> (select public.auth_gym_id())
     or not (select public.has_permission('payments', 'edit')) then
    raise exception 'not permitted';
  end if;

  if v_pay.status <> 'awaiting_verification' then
    raise exception 'this payment is not awaiting verification';
  end if;

  select * into v_res from public.record_payment_and_extend(
    v_pay.gym_id, v_pay.member_id, p_plan_id, v_pay.method,
    v_pay.reference, (select auth.uid()), null, current_date, p_payment_id);

  update public.payments
     set verified_by = (select auth.uid()), verified_at = now()
   where id = p_payment_id;

  return query select v_res.membership_id, v_res.invoice_id, v_res.expires_on;
end;
$$;

grant execute on function approve_payment(uuid, uuid) to authenticated;

create or replace function reject_payment(p_payment_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (select public.has_permission('payments', 'edit')) then
    raise exception 'not permitted';
  end if;

  update public.payments
     set status = 'failed',
         rejected_reason = p_reason,
         verified_by = (select auth.uid()),
         verified_at = now()
   where id = p_payment_id
     and gym_id = (select public.auth_gym_id())
     and status = 'awaiting_verification';
end;
$$;

grant execute on function reject_payment(uuid, text) to authenticated;
