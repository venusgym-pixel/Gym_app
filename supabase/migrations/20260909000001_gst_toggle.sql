-- Let a gym say it does not charge GST.
--
-- The system was built assuming every gym is registered: prices are stored
-- exclusive of tax and 18% is added at checkout. That is right for a chain,
-- and wrong for most single-branch gyms — registration is only compulsory
-- above ₹20 lakh of turnover, and a gym under that threshold has no GSTIN and
-- is not permitted to collect the tax. Charging it anyway is not a display
-- bug; it is collecting money the gym cannot lawfully keep.
--
-- Default true, because that is what every existing gym has been doing and a
-- migration must not silently change what anyone is billed.

alter table gyms
  add column if not exists gst_enabled boolean not null default true;

comment on column gyms.gst_enabled is
  'False for a gym below the GST registration threshold: plan prices are then '
  'the final price and invoices carry no tax lines.';


/*
  Issues an invoice for a payment.

  Intra-state supply splits into CGST + SGST; inter-state is IGST. Gyms are
  physically attended, so supply is almost always intra-state — but a gym in
  one state billing a corporate account in another is not impossible, so the
  split is explicit rather than assumed.

  GST is computed on the taxable value. Plan prices in this system are stored
  EXCLUSIVE of tax, matching how the checkout screen shows "GST 18%" as a
  separate line (M-04).

  The only change here: the gym's own setting overrides the rate the caller
  asked for. The gate lives inside this function rather than at its two call
  sites so that an unregistered gym cannot be charged tax by a code path
  somebody adds later and forgets to check — the rate is decided once, next to
  the row that decides it.
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
  v_rate   numeric;
  v_tax    bigint;
  v_id     uuid;
begin
  select * into v_gym from public.gyms g where g.id = p_gym_id;
  if not found then
    raise exception 'issue_invoice: gym % not found', p_gym_id;
  end if;

  v_rate := case when v_gym.gst_enabled then p_gst_rate else 0 end;
  v_tax  := round(p_taxable_paise * v_rate);

  select * into v_num from public.next_invoice_number(p_gym_id, p_date);

  /* Numbering is unchanged when tax is off. An invoice with no tax on it is
     still a numbered document the gym has to be able to produce, so it stays
     in the same gap-free sequence rather than being skipped. */
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
