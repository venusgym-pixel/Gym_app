-- ============================================================================
-- 0008 · Fix the access-token hook's return shape.
--
-- GoTrue requires the hook to return an object CONTAINING a `claims` key:
--
--     { "claims": { ...modified claims... } }
--
-- The original returned the claims object itself, so every sign-in failed
-- with "output claims field is missing" — a total auth outage the moment the
-- hook was switched on.
--
-- Nothing in the local test suite could catch this: the hook is invoked by
-- GoTrue during token issuance, not by Postgres, so it is only exercised
-- against a real Supabase project. tests/support/db.ts stubs the auth schema
-- and never calls it.
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

  -- The wrapper is the fix. Returning the bare claims object makes GoTrue
  -- reject every token request with "output claims field is missing".
  return jsonb_build_object(
    'claims', jsonb_set(v_claims, '{app_metadata}', v_app_md)
  );
end;
$$;

-- Re-assert the grants; create or replace does not disturb them, but an
-- explicit statement here means this migration is safe to run on a project
-- where the function was created by hand.
grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook(jsonb)
  from authenticated, anon, public;
