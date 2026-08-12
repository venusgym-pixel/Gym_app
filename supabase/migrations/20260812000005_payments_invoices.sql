-- ============================================================================
-- 0005 · Payments and GST invoices.
--
-- The invoice number is the part that cannot be fixed later. Indian GST
-- requires a sequential, gap-free series per supplier per financial year.
-- Gaps are an audit problem for the gym, not for us — which makes them worse,
-- because the customer discovers them at assessment time.
--
-- A Postgres SEQUENCE is the wrong tool: sequences deliberately do not roll
-- back, so a failed insert burns a number and leaves a hole. A counter row
-- locked inside the same transaction rolls back with it.
-- ============================================================================

create table payments (
  id            uuid primary key default gen_random_uuid(),
  gym_id        uuid not null references gyms(id) on delete cascade,
  member_id     uuid not null references members(id) on delete cascade,
  membership_id uuid references memberships(id) on delete set null,

  amount_paise  bigint not null check (amount_paise > 0),
  method        payment_method not null,
  status        payment_status not null default 'pending',

  paid_at       timestamptz,
  reference     text,                 -- UPI ref, cheque no, gateway id
  notes         text,

  -- Razorpay. Unique so a webhook replayed three times extends the
  -- membership once (docs/end-to-end-flow.md §2.8).
  gateway_payment_id text,
  gateway_order_id   text,

  recorded_by   uuid references profiles(id) on delete set null,
  refunded_at   timestamptz,
  refund_reason text,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index payments_gym_status_idx on payments (gym_id, status, created_at desc);
create index payments_gym_member_idx on payments (gym_id, member_id, created_at desc);

create unique index payments_gateway_id_idx
  on payments (gym_id, gateway_payment_id)
  where gateway_payment_id is not null;


-- ── invoice numbering ───────────────────────────────────────────────────────

-- One row per (gym, financial year). Locked for the duration of the
-- allocating transaction, so numbering is serialised per gym.
create table invoice_counters (
  gym_id      uuid not null references gyms(id) on delete cascade,
  fiscal_year text not null,               -- '2026-27'
  next_number integer not null default 1,
  primary key (gym_id, fiscal_year)
);

-- Indian FY runs 1 April to 31 March.
create or replace function fiscal_year_of(p_date date)
returns text
language sql immutable
set search_path = ''
as $$
  select case
    when extract(month from p_date) >= 4
      then to_char(p_date, 'YYYY') || '-' || to_char(p_date + interval '1 year', 'YY')
    else to_char(p_date - interval '1 year', 'YYYY') || '-' || to_char(p_date, 'YY')
  end;
$$;

create table invoices (
  id            uuid primary key default gen_random_uuid(),
  gym_id        uuid not null references gyms(id) on delete cascade,
  member_id     uuid not null references members(id) on delete cascade,
  payment_id    uuid references payments(id) on delete set null,
  membership_id uuid references memberships(id) on delete set null,

  invoice_no    text not null,
  fiscal_year   text not null,
  sequence_no   integer not null,
  issued_on     date not null default current_date,

  -- Snapshot of the supplier at issue time. A gym that later changes its
  -- name or GSTIN must not retroactively alter invoices already given out.
  gym_name      text not null,
  gym_gstin     text,
  place_of_supply text,

  -- SAC 999723 — "physical well-being including health club & fitness centre".
  sac_code      text not null default '999723',
  description   text not null,

  taxable_paise bigint not null check (taxable_paise >= 0),
  cgst_paise    bigint not null default 0,
  sgst_paise    bigint not null default 0,
  igst_paise    bigint not null default 0,
  total_paise   bigint not null,

  is_credit_note boolean not null default false,
  reverses_invoice_id uuid references invoices(id) on delete set null,

  created_at    timestamptz not null default now(),

  unique (gym_id, invoice_no),
  unique (gym_id, fiscal_year, sequence_no)
);

create index invoices_gym_issued_idx on invoices (gym_id, issued_on desc);
create index invoices_gym_member_idx on invoices (gym_id, member_id);

comment on table invoices is
  'Gap-free per (gym_id, fiscal_year). The unique constraint on sequence_no is '
  'the backstop; next_invoice_number() is what guarantees no gaps.';


/*
  Allocates the next number for a gym's current financial year.

  The row lock serialises concurrent invoice creation for one gym, which is
  exactly what gap-free numbering requires. Two gyms never block each other.
  If the caller's transaction rolls back, so does the increment.
*/
create or replace function next_invoice_number(
  p_gym_id uuid,
  p_date   date default current_date
)
returns table (invoice_no text, fiscal_year text, sequence_no integer)
language plpgsql
security definer
set search_path = ''
as $$
-- The RETURNS TABLE names are also variables in scope, and `fiscal_year`
-- collides with the invoice_counters column of the same name in the
-- ON CONFLICT target below. Resolve ambiguity toward the column.
#variable_conflict use_column
declare
  v_fy  text := public.fiscal_year_of(p_date);
  v_seq integer;
begin
  insert into public.invoice_counters (gym_id, fiscal_year, next_number)
  values (p_gym_id, v_fy, 1)
  on conflict (gym_id, fiscal_year) do nothing;

  update public.invoice_counters c
     set next_number = c.next_number + 1
   where c.gym_id = p_gym_id and c.fiscal_year = v_fy
  returning c.next_number - 1 into v_seq;

  return query select
    'INV/' || v_fy || '/' || lpad(v_seq::text, 4, '0'),
    v_fy,
    v_seq;
end;
$$;


/*
  Issues an invoice for a payment.

  Intra-state supply splits into CGST + SGST; inter-state is IGST. Gyms are
  physically attended, so supply is almost always intra-state — but a gym in
  one state billing a corporate account in another is not impossible, so the
  split is explicit rather than assumed.

  GST is computed on the taxable value. Plan prices in this system are stored
  EXCLUSIVE of tax, matching how the checkout screen shows "GST 18%" as a
  separate line (M-04).
*/
create or replace function issue_invoice(
  p_gym_id       uuid,
  p_member_id    uuid,
  p_payment_id   uuid,
  p_membership_id uuid,
  p_taxable_paise bigint,
  p_description  text,
  p_gst_rate     numeric default 0.18,
  p_inter_state  boolean default false,
  p_date         date default current_date
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_gym    public.gyms%rowtype;
  v_num    record;
  v_tax    bigint := round(p_taxable_paise * p_gst_rate);
  v_id     uuid;
begin
  select * into v_gym from public.gyms g where g.id = p_gym_id;
  if not found then
    raise exception 'issue_invoice: gym % not found', p_gym_id;
  end if;

  select * into v_num from public.next_invoice_number(p_gym_id, p_date);

  insert into public.invoices (
    gym_id, member_id, payment_id, membership_id,
    invoice_no, fiscal_year, sequence_no, issued_on,
    gym_name, gym_gstin, description,
    taxable_paise, cgst_paise, sgst_paise, igst_paise, total_paise
  ) values (
    p_gym_id, p_member_id, p_payment_id, p_membership_id,
    v_num.invoice_no, v_num.fiscal_year, v_num.sequence_no, p_date,
    v_gym.name, v_gym.gstin, p_description,
    p_taxable_paise,
    case when p_inter_state then 0 else v_tax / 2 end,
    case when p_inter_state then 0 else v_tax - (v_tax / 2) end,
    case when p_inter_state then v_tax else 0 end,
    p_taxable_paise + v_tax
  )
  returning id into v_id;

  return v_id;
end;
$$;


/*
  The money moment: record a payment, extend the membership, issue the invoice.

  One function so the three cannot drift apart — a payment without a
  membership extension is a member locked out at the turnstile, and a
  membership extension without an invoice is a GST problem.
*/
create or replace function record_payment_and_extend(
  p_gym_id      uuid,
  p_member_id   uuid,
  p_plan_id     uuid,
  p_method      payment_method,
  p_reference   text default null,
  p_recorded_by uuid default null,
  p_gateway_payment_id text default null,
  p_today       date default current_date
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

  insert into public.payments
    (gym_id, member_id, amount_paise, method, status, paid_at,
     reference, recorded_by, gateway_payment_id)
  values
    (p_gym_id, p_member_id, v_plan.price_paise, p_method, 'paid', now(),
     p_reference, p_recorded_by, p_gateway_payment_id)
  returning id into v_pay_id;

  /*
    One row per TERM, not one row per member.

    Extending the existing row in place would be simpler, but it overwrites
    started_on and expires_on — and the previous term's dates are exactly what
    the member profile's renewal history (A-04) has to show. Payments record
    what was paid and when; only the membership row records what was bought.

    The old term is closed as it is superseded, so the partial unique index
    from 0003 still sees exactly one live membership per member. renewed_from
    keeps the chain walkable for retention reporting.
  */
  if v_current.id is not null then
    -- Renewing early: the new term begins the day the old one ends, so the
    -- unused tail is kept rather than forfeited.
    v_start := greatest(p_today, v_current.expires_on + 1);

    -- Close it only if it is still live. A term the sweep already expired
    -- must keep that status, not be "re-expired" with a fresh timestamp.
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


-- ── RLS ─────────────────────────────────────────────────────────────────────

select private.apply_tenant_rls('payments',         'payments');
select private.apply_tenant_rls('invoices',         'payments');
select private.apply_tenant_rls('invoice_counters', 'payments');

-- Members see their own payments and invoices (M-06), nobody else's.
create policy payments_select_self on payments for select to authenticated
  using (
    gym_id = (select auth_gym_id())
    and exists (select 1 from members m
                 where m.id = payments.member_id and m.user_id = (select auth.uid()))
  );

create policy invoices_select_self on invoices for select to authenticated
  using (
    gym_id = (select auth_gym_id())
    and exists (select 1 from members m
                 where m.id = invoices.member_id and m.user_id = (select auth.uid()))
  );

create trigger payments_touch before update on payments
  for each row execute function private.touch_updated_at();
