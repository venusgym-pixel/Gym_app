-- ============================================================================
-- 0001 · Foundation: extensions, schemas, enums and the tenancy helpers that
--        every subsequent migration depends on.
--
-- The single load-bearing rule of this database:
--   every tenant table carries gym_id NOT NULL, and RLS compares it to the
--   caller's active gym. Tenancy is NEVER derived through a join — policies
--   that join scale badly and are easy to get subtly wrong.
-- ============================================================================

create extension if not exists "pgcrypto";      -- gen_random_uuid, digest
create extension if not exists "citext";        -- case-insensitive email
create extension if not exists "pg_cron";       -- scheduler (see 0008)

-- `private` holds helpers that must never be exposed through PostgREST.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;


-- ── enums ───────────────────────────────────────────────────────────────────

-- Mirrors docs/end-to-end-flow.md §5 (role permission matrix).
create type gym_role as enum (
  'owner',          -- full control incl. billing and deletion
  'manager',
  'trainer',
  'receptionist',
  'nutritionist',
  'member'
);

-- Mirrors the membership state machine in docs/end-to-end-flow.md §4.
create type membership_status as enum (
  'pending', 'active', 'expiring', 'expired', 'frozen', 'cancelled'
);

create type payment_status as enum (
  'pending', 'processing', 'paid', 'failed', 'refunded'
);

create type payment_method as enum (
  'cash', 'upi', 'card', 'netbanking', 'bank_transfer', 'other'
);

create type checkin_method as enum (
  'qr', 'manual', 'pin', 'member_id', 'phone'
);

create type notification_channel as enum (
  'whatsapp', 'sms', 'email', 'push', 'in_app'
);

create type notification_status as enum (
  'queued', 'sending', 'sent', 'delivered', 'read', 'failed', 'cancelled'
);


-- ── tenant root ─────────────────────────────────────────────────────────────

create table gyms (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  slug              citext not null unique,
  logo_url          text,
  address           text,
  phone             text,
  email             citext,

  -- India specifics. gstin is required before the gym can issue invoices;
  -- see invoice numbering in 0006.
  gstin             text,
  currency          char(3) not null default 'INR',
  timezone          text    not null default 'Asia/Kolkata',

  -- docs/end-to-end-flow.md §3: "Reminder dispatcher — Daily 09:00". The hour
  -- is per-gym so a Kerala gym and a Delhi gym don't compete for one slot.
  reminder_hour     smallint not null default 9
                      check (reminder_hour between 0 and 23),

  onboarding_state  text not null default 'setup',
  is_active         boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on table gyms is
  'Tenant root. Every other table in this database references it via gym_id.';


create table branches (
  id          uuid primary key default gen_random_uuid(),
  gym_id      uuid not null references gyms(id) on delete cascade,
  name        text not null,
  address     text,
  is_primary  boolean not null default false,
  created_at  timestamptz not null default now()
);

create index branches_gym_idx on branches (gym_id);


-- ── people ──────────────────────────────────────────────────────────────────

-- One row per auth.users row. Holds identity that is the same across every
-- gym a person belongs to. Gym-scoped facts live on gym_users / members.
create table profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  full_name    text,
  phone        text,
  email        citext,
  avatar_url   text,
  date_of_birth date,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

comment on table profiles is
  'Cross-tenant identity. Deliberately has no gym_id — a trainer may work at '
  'two gyms and a member may hold memberships at several.';


-- The tenancy link. A person''s role is a property of (person, gym), not of
-- the person, which is what makes multi-gym staff possible.
create table gym_users (
  id          uuid primary key default gen_random_uuid(),
  gym_id      uuid not null references gyms(id) on delete cascade,
  user_id     uuid not null references profiles(id) on delete cascade,
  role        gym_role not null,
  is_active   boolean not null default true,

  -- Set when access is withdrawn. Checked by auth_gym_id() so a fired trainer
  -- loses access on their next token refresh rather than at row level only.
  revoked_at  timestamptz,

  created_at  timestamptz not null default now(),
  unique (gym_id, user_id)
);

create index gym_users_gym_idx  on gym_users (gym_id) where revoked_at is null;
create index gym_users_user_idx on gym_users (user_id) where revoked_at is null;


-- ── permissions: the 6 x 15 matrix ──────────────────────────────────────────
--
-- Deliberately a TABLE, not JWT claims. docs/end-to-end-flow.md §5 defines
-- fine-grained rules, and JWT claims go stale on revocation — a demoted
-- manager would keep manager rights until their token expired.

create table role_permissions (
  role     gym_role not null,
  module   text     not null,
  can_view   boolean not null default false,
  can_create boolean not null default false,
  can_edit   boolean not null default false,
  can_delete boolean not null default false,
  -- 'all' = every record in the gym; 'assigned' = only linked members;
  -- 'own' = only the caller's own records.
  scope    text not null default 'all'
             check (scope in ('all', 'assigned', 'own', 'none')),
  primary key (role, module)
);

comment on table role_permissions is
  'Global, not per-gym: the role model is the same for every tenant. '
  'Per-gym overrides, if ever needed, belong in a separate table.';


-- ── tenancy helpers ─────────────────────────────────────────────────────────
--
-- Every one of these is STABLE so Postgres evaluates them once per query
-- rather than once per row, and every RLS policy wraps them in (select ...)
-- for the same reason. Supabase benchmarks that pattern at ~95% faster.

-- The caller's active gym, injected as a JWT claim by the access-token hook
-- in 0003. Returns null for anon and for users with no gym membership.
create or replace function auth_gym_id()
returns uuid
language sql stable
set search_path = ''
as $$
  select nullif(
    coalesce(
      current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'gym_id',
      current_setting('request.jwt.claims', true)::jsonb ->> 'gym_id'
    ),
    ''
  )::uuid;
$$;

create or replace function auth_role()
returns gym_role
language sql stable
set search_path = ''
as $$
  select nullif(
    coalesce(
      current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'gym_role',
      current_setting('request.jwt.claims', true)::jsonb ->> 'gym_role'
    ),
    ''
  )::public.gym_role;
$$;

-- SECURITY DEFINER so policies can read role_permissions without the caller
-- needing rights on it. This is the only sanctioned privilege escalation in
-- the schema, and it is read-only against a global lookup table.
create or replace function has_permission(p_module text, p_action text)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select coalesce(
    (select case p_action
              when 'view'   then rp.can_view
              when 'create' then rp.can_create
              when 'edit'   then rp.can_edit
              when 'delete' then rp.can_delete
              else false
            end
       from public.role_permissions rp
      where rp.role = public.auth_role()
        and rp.module = p_module),
    false
  );
$$;

create or replace function permission_scope(p_module text)
returns text
language sql stable security definer
set search_path = ''
as $$
  select coalesce(
    (select rp.scope
       from public.role_permissions rp
      where rp.role = public.auth_role()
        and rp.module = p_module),
    'none'
  );
$$;

revoke execute on function has_permission(text, text)  from public, anon;
revoke execute on function permission_scope(text)      from public, anon;
grant  execute on function has_permission(text, text)  to authenticated, service_role;
grant  execute on function permission_scope(text)      to authenticated, service_role;


-- ── the policy generator ────────────────────────────────────────────────────
--
-- 40-odd tables x 4 actions is ~160 policies. Hand-writing them is how a
-- tenant leak gets introduced. This applies the standard set consistently;
-- tables needing narrower rules (trainers seeing only assigned clients,
-- members seeing only themselves) add extra policies on top.
--
-- These policies grant gym-WIDE access, so they deliberately require
-- scope = 'all'. A role holding 'assigned' or 'own' on a module gets nothing
-- from here and must be granted access by an explicit, narrower policy that
-- knows which column means "mine" for that table. Without this check the
-- scope column would be decorative, and a member with scope 'own' on the
-- members module would read every member in the gym.

create or replace function private.apply_tenant_rls(
  p_table  text,
  p_module text
)
returns void
language plpgsql
as $$
begin
  execute format('alter table public.%I enable row level security', p_table);
  execute format('alter table public.%I force row level security', p_table);

  execute format($f$
    create policy %I on public.%I for select to authenticated
    using (
      gym_id = (select public.auth_gym_id())
      and (select public.has_permission(%L, 'view'))
      and (select public.permission_scope(%L)) = 'all'
    )$f$, p_table || '_select', p_table, p_module, p_module);

  execute format($f$
    create policy %I on public.%I for insert to authenticated
    with check (
      gym_id = (select public.auth_gym_id())
      and (select public.has_permission(%L, 'create'))
      and (select public.permission_scope(%L)) = 'all'
    )$f$, p_table || '_insert', p_table, p_module, p_module);

  execute format($f$
    create policy %I on public.%I for update to authenticated
    using (
      gym_id = (select public.auth_gym_id())
      and (select public.has_permission(%L, 'edit'))
      and (select public.permission_scope(%L)) = 'all'
    )
    with check (gym_id = (select public.auth_gym_id()))$f$,
    p_table || '_update', p_table, p_module, p_module);

  execute format($f$
    create policy %I on public.%I for delete to authenticated
    using (
      gym_id = (select public.auth_gym_id())
      and (select public.has_permission(%L, 'delete'))
      and (select public.permission_scope(%L)) = 'all'
    )$f$, p_table || '_delete', p_table, p_module, p_module);
end;
$$;

comment on function private.apply_tenant_rls is
  'Applies the standard four tenant policies to a table. FORCE RLS is set so '
  'the policies also bind the table owner — without it, a definer function '
  'running as owner would silently bypass tenant isolation.';


-- ── updated_at ──────────────────────────────────────────────────────────────

create or replace function private.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;


-- ── RLS on the foundation tables ────────────────────────────────────────────

alter table gyms             enable row level security;
alter table gyms             force  row level security;
alter table branches         enable row level security;
alter table branches         force  row level security;
alter table profiles         enable row level security;
alter table profiles         force  row level security;
alter table gym_users        enable row level security;
alter table gym_users        force  row level security;
alter table role_permissions enable row level security;
alter table role_permissions force  row level security;

-- gyms: keyed on id rather than gym_id, so it can't use the generator.
create policy gyms_select on gyms for select to authenticated
  using (id = (select auth_gym_id()));

create policy gyms_update on gyms for update to authenticated
  using (id = (select auth_gym_id()) and (select has_permission('settings', 'edit')))
  with check (id = (select auth_gym_id()));

-- No insert/delete policy: gyms are created by the onboarding flow through
-- the service role, and deleted by a human. Absence of a policy denies both.

select private.apply_tenant_rls('branches', 'settings');

-- profiles: a person sees their own, plus anyone who shares a gym with them
-- and whom they are permitted to see.
create policy profiles_select_self on profiles for select to authenticated
  using (id = (select auth.uid()));

create policy profiles_update_self on profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy profiles_select_same_gym on profiles for select to authenticated
  using (
    (select has_permission('members', 'view'))
    and (select permission_scope('members')) = 'all'
    and exists (
      select 1 from gym_users gu
      where gu.user_id = profiles.id
        and gu.gym_id = (select auth_gym_id())
        and gu.revoked_at is null
    )
  );

select private.apply_tenant_rls('gym_users', 'staff');

-- Everyone may read the permission matrix — it is how the UI decides which
-- nav items to render. Nothing in it is gym-specific or sensitive.
create policy role_permissions_select on role_permissions for select
  to authenticated using (true);

create trigger gyms_touch    before update on gyms
  for each row execute function private.touch_updated_at();
create trigger profiles_touch before update on profiles
  for each row execute function private.touch_updated_at();
