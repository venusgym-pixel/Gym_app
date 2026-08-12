-- ============================================================================
-- 0002 · Custom access token hook + the role permission matrix.
--
-- The hook stamps gym_id and gym_role into every issued JWT so RLS can read
-- the caller's tenant without a lookup. Only those two claims go in the token:
-- they are cheap and change rarely. Fine-grained permissions stay in
-- role_permissions, because a JWT cannot be revoked mid-flight and a demoted
-- manager must lose rights immediately, not in an hour.
--
-- Enable in the dashboard: Authentication -> Hooks -> Customize Access Token
-- (Postgres function form). Still labelled Beta by Supabase.
-- ============================================================================

create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql stable
set search_path = ''
as $$
declare
  v_user_id     uuid  := (event ->> 'user_id')::uuid;
  v_claims      jsonb := coalesce(event -> 'claims', '{}'::jsonb);
  v_app_md      jsonb := coalesce(v_claims -> 'app_metadata', '{}'::jsonb);
  v_requested   uuid  := nullif(v_app_md ->> 'active_gym_id', '')::uuid;
  v_gym_id      uuid;
  v_role        public.gym_role;
begin
  -- Honour an explicitly chosen gym (the S-09 gym switcher writes
  -- app_metadata.active_gym_id, then the client refreshes its session) — but
  -- only if the user genuinely still belongs to it.
  if v_requested is not null then
    select gu.gym_id, gu.role into v_gym_id, v_role
      from public.gym_users gu
     where gu.user_id = v_user_id
       and gu.gym_id  = v_requested
       and gu.is_active
       and gu.revoked_at is null
     limit 1;
  end if;

  -- Otherwise fall back to their longest-standing active membership.
  if v_gym_id is null then
    select gu.gym_id, gu.role into v_gym_id, v_role
      from public.gym_users gu
     where gu.user_id = v_user_id
       and gu.is_active
       and gu.revoked_at is null
     order by gu.created_at
     limit 1;
  end if;

  -- A user with no active membership gets a token carrying no gym. Every
  -- policy compares against auth_gym_id(), and `gym_id = null` is never true,
  -- so they can read nothing. That is the correct default.
  if v_gym_id is not null then
    v_app_md := v_app_md
      || jsonb_build_object('gym_id', v_gym_id, 'gym_role', v_role);
  else
    v_app_md := (v_app_md - 'gym_id') - 'gym_role';
  end if;

  return jsonb_set(v_claims, '{app_metadata}', v_app_md);
end;
$$;

-- Grants exactly as Supabase's auth-hooks guide specifies.
grant usage on schema public to supabase_auth_admin;
grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook(jsonb)
  from authenticated, anon, public;

-- The hook runs as supabase_auth_admin, which must read the tenancy link.
grant select on table public.gym_users to supabase_auth_admin;

create policy gym_users_auth_admin_read on public.gym_users
  as permissive for select to supabase_auth_admin using (true);


-- ============================================================================
-- Role permission matrix — docs/end-to-end-flow.md §5.
--
-- Only granted rows are stored; a missing (role, module) row denies, because
-- has_permission() coalesces to false. scope: 'all' = every record in the gym,
-- 'assigned' = only linked clients, 'own' = only the caller's own records.
-- ============================================================================

insert into role_permissions (role, module, can_view, can_create, can_edit, can_delete, scope) values
  -- ── owner: everything, everywhere ────────────────────────────────────────
  ('owner', 'dashboard',   true,  true,  true,  true,  'all'),
  ('owner', 'members',     true,  true,  true,  true,  'all'),
  ('owner', 'memberships', true,  true,  true,  true,  'all'),
  ('owner', 'payments',    true,  true,  true,  true,  'all'),
  ('owner', 'attendance',  true,  true,  true,  true,  'all'),
  ('owner', 'workouts',    true,  true,  true,  true,  'all'),
  ('owner', 'exercises',   true,  true,  true,  true,  'all'),
  ('owner', 'diet',        true,  true,  true,  true,  'all'),
  ('owner', 'progress',    true,  true,  true,  true,  'all'),
  ('owner', 'staff',       true,  true,  true,  true,  'all'),
  ('owner', 'leads',       true,  true,  true,  true,  'all'),
  ('owner', 'messaging',   true,  true,  true,  true,  'all'),
  ('owner', 'reports',     true,  true,  true,  true,  'all'),
  ('owner', 'settings',    true,  true,  true,  true,  'all'),

  -- ── manager: runs the floor, cannot restructure the business ─────────────
  ('manager', 'dashboard',   true,  false, false, false, 'all'),
  ('manager', 'members',     true,  true,  true,  true,  'all'),
  ('manager', 'memberships', true,  true,  true,  true,  'all'),
  ('manager', 'payments',    true,  true,  false, false, 'all'),  -- collect, not amend
  ('manager', 'attendance',  true,  true,  true,  true,  'all'),
  ('manager', 'workouts',    true,  false, false, false, 'all'),
  ('manager', 'exercises',   true,  false, false, false, 'all'),
  ('manager', 'diet',        true,  false, false, false, 'all'),
  ('manager', 'progress',    true,  false, false, false, 'all'),
  ('manager', 'staff',       true,  false, false, false, 'all'),
  ('manager', 'leads',       true,  true,  true,  true,  'all'),
  ('manager', 'messaging',   true,  true,  true,  true,  'all'),
  ('manager', 'reports',     true,  false, false, false, 'all'),
  ('manager', 'settings',    true,  false, true,  false, 'all'),

  -- ── trainer: their own clients only ──────────────────────────────────────
  ('trainer', 'dashboard',  true,  false, false, false, 'assigned'),
  ('trainer', 'members',    true,  false, false, false, 'assigned'),
  ('trainer', 'attendance', true,  false, false, false, 'assigned'),
  ('trainer', 'workouts',   true,  true,  true,  true,  'assigned'),
  ('trainer', 'exercises',  true,  true,  true,  false, 'all'),
  ('trainer', 'diet',       true,  true,  false, false, 'assigned'),
  ('trainer', 'progress',   true,  true,  true,  false, 'assigned'),
  ('trainer', 'messaging',  true,  true,  false, false, 'assigned'),
  ('trainer', 'reports',    true,  false, false, false, 'own'),

  -- ── receptionist: front desk operations ──────────────────────────────────
  ('receptionist', 'dashboard',   true,  false, false, false, 'all'),
  ('receptionist', 'members',     true,  true,  false, false, 'all'),
  ('receptionist', 'memberships', true,  true,  true,  false, 'all'),
  ('receptionist', 'payments',    true,  true,  false, false, 'all'),
  ('receptionist', 'attendance',  true,  true,  false, false, 'all'),
  ('receptionist', 'exercises',   true,  false, false, false, 'all'),
  ('receptionist', 'leads',       true,  true,  true,  true,  'all'),
  ('receptionist', 'messaging',   true,  false, false, false, 'all'),

  -- ── nutritionist ─────────────────────────────────────────────────────────
  ('nutritionist', 'dashboard', true,  false, false, false, 'assigned'),
  ('nutritionist', 'members',   true,  false, false, false, 'assigned'),
  ('nutritionist', 'exercises', true,  false, false, false, 'all'),
  ('nutritionist', 'diet',      true,  true,  true,  true,  'all'),
  ('nutritionist', 'progress',  true,  false, false, false, 'assigned'),
  ('nutritionist', 'messaging', true,  true,  false, false, 'assigned'),

  -- ── member: their own record and nothing else ────────────────────────────
  ('member', 'dashboard',   true,  false, false, false, 'own'),
  ('member', 'members',     true,  false, true,  false, 'own'),
  ('member', 'memberships', true,  false, false, false, 'own'),
  ('member', 'payments',    true,  true,  false, false, 'own'),
  ('member', 'attendance',  true,  true,  false, false, 'own'),
  ('member', 'workouts',    true,  false, true,  false, 'own'),   -- log, not author
  ('member', 'exercises',   true,  false, false, false, 'all'),
  ('member', 'diet',        true,  false, false, false, 'own'),
  ('member', 'progress',    true,  true,  true,  false, 'own'),
  ('member', 'messaging',   true,  true,  false, false, 'own'),
  ('member', 'settings',    true,  false, true,  false, 'own');
