-- ============================================================================
-- 0003 · Members, consent, plans and memberships.
--
-- Two things here cannot be retrofitted and so are built in from the start:
--   · member_consents — DPDP Rules 2025 Rule 10 requires verifiable guardian
--     consent for under-18s. Gyms have teenage members. Backfilling consent
--     records into a live member base is not possible after the fact.
--   · membership date arithmetic — renewing BEFORE expiry extends from the
--     existing expiry; renewing AFTER starts from today. Encoded once, in
--     next_expiry(), so no caller can get it wrong.
-- ============================================================================

-- ── members ─────────────────────────────────────────────────────────────────

create table members (
  id            uuid primary key default gen_random_uuid(),
  gym_id        uuid not null references gyms(id) on delete cascade,

  -- Null until the member activates their app login. Members created at
  -- reception exist without an auth account, and every automation must still
  -- reach them over WhatsApp/SMS.
  user_id       uuid references profiles(id) on delete set null,

  member_code   text not null,
  full_name     text not null,
  phone         text not null,
  email         citext,
  date_of_birth date,
  gender        text,
  address       text,
  photo_url     text,

  emergency_contact_name  text,
  emergency_contact_phone text,

  -- Fitness profile (ui-screens-spec A-07). Nullable: reception rarely has
  -- this at signup; the trainer fills it at the initial assessment.
  height_cm       numeric(5,1),
  goal            text,
  fitness_level   text,
  target_weight_kg numeric(5,1),
  injuries        text,

  joined_on     date not null default current_date,
  is_active     boolean not null default true,
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  -- Member codes and phone numbers are unique per gym, not globally: the same
  -- person may belong to two gyms, and two gyms may both use "M-001".
  unique (gym_id, member_code),
  unique (gym_id, phone)
);

create index members_gym_active_idx on members (gym_id, is_active);
create index members_gym_name_idx   on members (gym_id, full_name);
create index members_user_idx       on members (user_id) where user_id is not null;

comment on column members.user_id is
  'Null for reception-created members with no app login. Never assume it is set.';


-- ── consent (DPDP) ──────────────────────────────────────────────────────────

create table member_consents (
  id            uuid primary key default gen_random_uuid(),
  gym_id        uuid not null references gyms(id) on delete cascade,
  member_id     uuid not null references members(id) on delete cascade,

  -- 'waiver' | 'terms' | 'data_processing' | 'marketing' | 'guardian'
  consent_type  text not null,
  granted       boolean not null,

  -- Populated only for 'guardian'. DPDP Rule 10 requires the guardian be
  -- identifiable and the consent verifiable, not just a ticked box.
  guardian_name         text,
  guardian_phone        text,
  guardian_relationship text,
  verification_method   text,

  document_url  text,
  granted_at    timestamptz not null default now(),
  withdrawn_at  timestamptz,
  -- Evidence for a Board enquiry: who ticked it, from where.
  recorded_by   uuid references profiles(id) on delete set null,
  ip_address    inet,

  constraint guardian_consent_needs_guardian check (
    consent_type <> 'guardian'
    or (guardian_name is not null and guardian_phone is not null)
  )
);

create index member_consents_member_idx on member_consents (gym_id, member_id);

comment on table member_consents is
  'DPDP Rules 2025 Rule 10. A member under 18 on their joining date must have '
  'a granted consent_type=''guardian'' row before any processing.';


-- ── plans ───────────────────────────────────────────────────────────────────

create table plans (
  id                uuid primary key default gen_random_uuid(),
  gym_id            uuid not null references gyms(id) on delete cascade,
  name              text not null,
  duration_days     integer not null check (duration_days > 0),
  price_paise       bigint  not null check (price_paise >= 0),
  joining_fee_paise bigint  not null default 0 check (joining_fee_paise >= 0),
  pt_sessions       integer not null default 0 check (pt_sessions >= 0),
  freeze_days_allowed integer not null default 0 check (freeze_days_allowed >= 0),
  description       text,
  is_visible_to_members boolean not null default true,
  is_active         boolean not null default true,
  sort_order        integer not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (gym_id, name)
);

create index plans_gym_active_idx on plans (gym_id, is_active);

comment on column plans.price_paise is
  'Money is stored in paise as bigint. Never float — ₹8,500.00 in a float '
  'eventually prints as ₹8,499.99 on an invoice.';


-- ── memberships ─────────────────────────────────────────────────────────────

create table memberships (
  id            uuid primary key default gen_random_uuid(),
  gym_id        uuid not null references gyms(id) on delete cascade,
  member_id     uuid not null references members(id) on delete cascade,
  plan_id       uuid not null references plans(id) on delete restrict,

  status        membership_status not null default 'pending',
  started_on    date not null,
  expires_on    date not null,

  price_paise    bigint not null check (price_paise >= 0),
  discount_paise bigint not null default 0 check (discount_paise >= 0),

  auto_renew    boolean not null default false,
  -- Set when this membership was created by renewing another, so the renewal
  -- chain (and therefore retention) is reconstructable.
  renewed_from  uuid references memberships(id) on delete set null,
  cancelled_at  timestamptz,
  cancel_reason text,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint expiry_after_start check (expires_on >= started_on)
);

-- gym_id leads every composite index: every query filters on it first, and
-- RLS adds that predicate even when the caller's query does not.
create index memberships_gym_status_expiry_idx
  on memberships (gym_id, status, expires_on);
create index memberships_gym_member_idx
  on memberships (gym_id, member_id, expires_on desc);

-- A member may hold only one live membership at a time. Partial unique index
-- rather than a trigger, so the database enforces it under concurrency.
create unique index memberships_one_live_per_member
  on memberships (member_id)
  where status in ('pending', 'active', 'expiring', 'frozen');


create table membership_freezes (
  id             uuid primary key default gen_random_uuid(),
  gym_id         uuid not null references gyms(id) on delete cascade,
  membership_id  uuid not null references memberships(id) on delete cascade,
  starts_on      date not null,
  days           integer not null check (days > 0),
  reason         text,
  -- Recorded so the freeze can be reversed exactly if applied in error.
  previous_expires_on date not null,
  new_expires_on      date not null,
  created_by     uuid references profiles(id) on delete set null,
  created_at     timestamptz not null default now()
);

create index membership_freezes_membership_idx
  on membership_freezes (gym_id, membership_id);


-- ── membership date arithmetic ──────────────────────────────────────────────

-- docs/end-to-end-flow.md §2.5: "renewing BEFORE expiry extends from the
-- existing expiry date. Renewing AFTER expiry starts from today." The UI must
-- show the resulting date before payment, so both must call this.
create or replace function next_expiry(
  p_current_expiry date,
  p_duration_days  integer,
  p_today          date default current_date
)
returns date
language sql immutable
set search_path = ''
as $$
  select greatest(coalesce(p_current_expiry, p_today), p_today) + p_duration_days;
$$;

comment on function next_expiry is
  'Single source of truth for renewal dates. Renewing early never loses the '
  'unused tail of the current membership; renewing late never back-dates.';


-- Guardian consent gate. Called by the member-creation flow and asserted in
-- tests; not a trigger, because reception legitimately creates the member row
-- and the consent row in the same transaction.
create or replace function member_requires_guardian_consent(p_member_id uuid)
returns boolean
language sql stable
set search_path = ''
as $$
  select exists (
    select 1 from public.members m
     where m.id = p_member_id
       and m.date_of_birth is not null
       and m.date_of_birth > (current_date - interval '18 years')
  );
$$;


-- ── RLS ─────────────────────────────────────────────────────────────────────

select private.apply_tenant_rls('members',            'members');
select private.apply_tenant_rls('member_consents',    'members');
select private.apply_tenant_rls('plans',              'memberships');
select private.apply_tenant_rls('memberships',        'memberships');
select private.apply_tenant_rls('membership_freezes', 'memberships');

-- A member reads their own record regardless of the 'members' module grant,
-- which for role=member is scope 'own'. The generated policy already limits
-- them to their gym; this narrows it to themselves.
create policy members_select_self on members for select to authenticated
  using (
    gym_id = (select auth_gym_id())
    and user_id = (select auth.uid())
  );

create policy members_update_self on members for update to authenticated
  using (
    gym_id = (select auth_gym_id())
    and user_id = (select auth.uid())
    and (select permission_scope('members')) = 'own'
  )
  with check (gym_id = (select auth_gym_id()) and user_id = (select auth.uid()));

-- Plans are the shop window: any signed-in member may read the visible ones
-- so M-03 "Choose a plan" works without granting the memberships module.
create policy plans_select_visible on plans for select to authenticated
  using (
    gym_id = (select auth_gym_id())
    and is_visible_to_members
    and is_active
  );

create trigger members_touch     before update on members
  for each row execute function private.touch_updated_at();
create trigger plans_touch       before update on plans
  for each row execute function private.touch_updated_at();
create trigger memberships_touch before update on memberships
  for each row execute function private.touch_updated_at();
