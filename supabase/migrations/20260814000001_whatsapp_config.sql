-- ============================================================================
-- 0018 · Per-gym WhatsApp credentials, configured from the admin screen.
--
-- Not environment variables. Each gym onboards its OWN WhatsApp Business
-- Account under the Tech Provider model, so each has its own phone number id,
-- its own token, and its own message bill. Platform-wide env vars would mean
-- one WABA for every tenant — which Meta does not allow and which would put
-- one gym's messaging spend on another's account.
--
-- The access token is a bearer credential that can send messages billed to
-- the gym, so it does NOT live in this table. It goes into Supabase Vault and
-- only its id is stored here. Nothing readable by an authenticated session
-- ever contains the token: the admin form writes it through a definer
-- function and can never read it back, and only the cron worker (service
-- role) decrypts it at send time.
-- ============================================================================

create table whatsapp_configs (
  gym_id           uuid primary key references gyms(id) on delete cascade,

  -- From Meta: WhatsApp → API setup.
  phone_number_id  text not null,
  waba_id          text,
  -- Shown in the admin so an owner can tell which number is connected.
  display_number   text,

  -- The Vault row holding the system-user token. Never the token itself.
  token_secret_id  uuid,

  -- Echoed back to Meta when it verifies the webhook. The gym invents it.
  verify_token     text,

  -- Updated by the last send or test, so the admin screen can say whether
  -- this actually works rather than merely whether it is filled in.
  last_error       text,
  last_ok_at       timestamptz,
  last_checked_at  timestamptz,

  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

select private.apply_tenant_rls('whatsapp_configs', 'settings');

create trigger whatsapp_configs_touch before update on whatsapp_configs
  for each row execute function private.touch_updated_at();

-- Webhooks arrive identified only by phone_number_id, with no session, so the
-- handler has to map that back to a gym before it can record anything.
create index whatsapp_configs_phone_idx on whatsapp_configs (phone_number_id);


-- ── the token, written but never read ───────────────────────────────────────

/**
 * Store or replace a gym's WhatsApp token.
 *
 * SECURITY DEFINER because Vault is not reachable by `authenticated`, and
 * deliberately so — the point is that the browser session can write a token
 * and never read one. Permission is re-checked here rather than trusted from
 * the caller.
 */
create or replace function set_whatsapp_token(p_gym_id uuid, p_token text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing uuid;
  v_name text := 'whatsapp_token_' || p_gym_id::text;
begin
  if p_gym_id <> (select public.auth_gym_id())
     or not (select public.has_permission('settings', 'edit')) then
    raise exception 'not permitted';
  end if;

  select token_secret_id into v_existing
    from public.whatsapp_configs where gym_id = p_gym_id;

  if v_existing is not null then
    perform vault.update_secret(v_existing, p_token);
  else
    -- create_secret returns the new id; store it against the gym.
    update public.whatsapp_configs
       set token_secret_id = vault.create_secret(p_token, v_name)
     where gym_id = p_gym_id;
  end if;
end;
$$;

revoke all on function set_whatsapp_token(uuid, text) from public;
grant execute on function set_whatsapp_token(uuid, text) to authenticated;

comment on function set_whatsapp_token is
  'Writes a gym''s WhatsApp token into Vault. Write-only by design: there is '
  'no matching reader for authenticated, only the service-role cron worker.';


-- ── what a template needs to be sent as a TEMPLATE ──────────────────────────
--
-- Outside a 24-hour customer service window WhatsApp refuses free-form text
-- (error 131047), and every reminder this product sends is business-initiated.
-- So the adapter has to send an approved template with ordered parameters,
-- and the rendered sentence we already store is not enough — the PARTS are
-- what Meta wants.

alter table message_templates
  add column provider_language text not null default 'en',
  -- Which vars fill {{1}}, {{2}}, … in the approved template, in order.
  add column param_keys text[] not null default '{}',
  -- Mirrors Meta's review state so the admin screen can show what is actually
  -- sendable. Meta is the source of truth; this is a cache.
  add column provider_status text not null default 'unknown'
    check (provider_status in ('unknown', 'pending', 'approved', 'rejected', 'paused'));

-- The vars were rendered into `body` and then thrown away, which is fine for
-- a log and useless for a template send. Keep them.
alter table notification_outbox
  add column vars jsonb not null default '{}'::jsonb;

comment on column notification_outbox.vars is
  'The substitution values, kept because a template send needs the parts, '
  'not the rendered sentence.';


-- ── enqueue: remember the vars ──────────────────────────────────────────────

create or replace function enqueue_notification(
  p_gym_id        uuid,
  p_member_id     uuid,
  p_membership_id uuid,
  p_rule_key      text,
  p_channel       notification_channel,
  p_scheduled_date date,
  p_vars          jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member   public.members%rowtype;
  v_gym      public.gyms%rowtype;
  v_tpl      public.message_templates%rowtype;
  v_body     text;
  v_subject  text;
  v_id       uuid;
begin
  select * into v_member from public.members m where m.id = p_member_id;
  if not found then return null; end if;

  select * into v_gym from public.gyms g where g.id = p_gym_id;

  select * into v_tpl
    from public.message_templates t
   where t.gym_id = p_gym_id and t.key = p_rule_key
     and t.channel = p_channel and t.is_active;

  if found then
    v_body    := private.render_template(v_tpl.body, p_vars);
    v_subject := private.render_template(coalesce(v_tpl.subject, ''), p_vars);
  else
    v_body    := coalesce(p_vars ->> 'fallback',
                          'Reminder from ' || coalesce(v_gym.name, 'your gym'));
    v_subject := null;
  end if;

  insert into public.notification_outbox
    (gym_id, member_id, membership_id, rule_key, channel, scheduled_date,
     to_phone, to_email, subject, body, vars)
  values
    (p_gym_id, p_member_id, p_membership_id, p_rule_key, p_channel, p_scheduled_date,
     v_member.phone, v_member.email, nullif(v_subject, ''), v_body, coalesce(p_vars, '{}'::jsonb))
  on conflict (gym_id, member_id, rule_key, channel, scheduled_date) do nothing
  returning id into v_id;

  return v_id;
end;
$$;
