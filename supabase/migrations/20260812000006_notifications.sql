-- ============================================================================
-- 0006 · The automation engine: outbox, templates, reminder rules.
--
-- ADR-3. No workflow vendor. docs/end-to-end-flow.md §3 already requires a
-- delivery log the gym owner can inspect (A-37) with 15-minute retries — that
-- IS a durable outbox, and a second copy of the same state inside a hosted
-- engine is how "why didn't Ravi get his reminder?" becomes unanswerable.
--
-- The reliability guarantee is one unique index, not durable execution:
-- a redeploy mid-run, a double cron tick, or a manual re-run cannot send the
-- same reminder twice. Duplicate WhatsApp messages cost real money, and are
-- the fastest way to get a gym owner to switch automation off.
-- ============================================================================

create table message_templates (
  id          uuid primary key default gen_random_uuid(),
  gym_id      uuid not null references gyms(id) on delete cascade,
  key         text not null,                    -- 'expiry_7d', 'inactive_14d'
  channel     notification_channel not null,
  subject     text,
  body        text not null,
  -- Meta requires utility templates be pre-approved and referenced by name.
  provider_template_name text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (gym_id, key, channel)
);

create index message_templates_gym_idx on message_templates (gym_id) where is_active;

comment on column message_templates.body is
  'Placeholders in {{name}} form: name, days, plan, amount, expiry, gym.';


-- ── reminder rules: the ladder ──────────────────────────────────────────────

create table reminder_rules (
  id          uuid primary key default gen_random_uuid(),
  gym_id      uuid not null references gyms(id) on delete cascade,
  key         text not null,

  -- Negative = before expiry, 0 = on the day, positive = after.
  -- -30, -15, -7, -3, -1, 0, +3 is the ladder in §2.5.
  offset_days integer not null,

  channels    notification_channel[] not null default '{whatsapp,push}',
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (gym_id, key)
);

create index reminder_rules_gym_idx on reminder_rules (gym_id) where is_active;


-- ── the outbox ──────────────────────────────────────────────────────────────

create table notification_outbox (
  id            uuid primary key default gen_random_uuid(),
  gym_id        uuid not null references gyms(id) on delete cascade,
  member_id     uuid references members(id) on delete cascade,
  membership_id uuid references memberships(id) on delete set null,

  rule_key      text not null,                  -- 'expiry_7d', 'inactive_7d'
  channel       notification_channel not null,
  -- The day this was generated FOR. Part of the dedup key, so re-running the
  -- daily job is safe and a job that failed halfway can simply be re-run.
  scheduled_date date not null,

  to_phone      text,
  to_email      text,
  subject       text,
  body          text not null,

  status        notification_status not null default 'queued',
  attempts      integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  provider_message_id text,
  error         text,

  sent_at       timestamptz,
  delivered_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- THE guarantee. One reminder per membership per rule per day, per channel,
-- no matter how many times the job runs.
create unique index notification_outbox_dedup_idx
  on notification_outbox (gym_id, member_id, rule_key, channel, scheduled_date);

-- The drain worker's query: due, not yet done, oldest first.
create index notification_outbox_due_idx
  on notification_outbox (status, next_attempt_at)
  where status in ('queued', 'failed');

create index notification_outbox_gym_idx
  on notification_outbox (gym_id, created_at desc);

comment on index notification_outbox_dedup_idx is
  'The reliability guarantee for the whole automation engine. Do not drop it '
  'to "fix" a duplicate-key error — that error IS the feature working.';


-- ── rendering ───────────────────────────────────────────────────────────────

create or replace function private.render_template(p_body text, p_vars jsonb)
returns text
language plpgsql immutable
as $$
declare
  v_out text := p_body;
  v_key text;
begin
  for v_key in select jsonb_object_keys(p_vars) loop
    v_out := replace(v_out, '{{' || v_key || '}}', coalesce(p_vars ->> v_key, ''));
  end loop;
  return v_out;
end;
$$;


-- ── enqueue ─────────────────────────────────────────────────────────────────

/*
  Adds one message to the outbox, or does nothing if this exact reminder is
  already queued or sent. Returns the id when it enqueued, null when the
  dedup index caught a repeat — which callers use to count real work done.
*/
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
    -- No template configured: still queue something legible rather than
    -- silently dropping the reminder. A blank message is a bug the gym owner
    -- can see in A-37; a missing one is invisible.
    v_body    := coalesce(p_vars ->> 'fallback',
                          'Reminder from ' || coalesce(v_gym.name, 'your gym'));
    v_subject := null;
  end if;

  insert into public.notification_outbox
    (gym_id, member_id, membership_id, rule_key, channel, scheduled_date,
     to_phone, to_email, subject, body)
  values
    (p_gym_id, p_member_id, p_membership_id, p_rule_key, p_channel, p_scheduled_date,
     v_member.phone, v_member.email, nullif(v_subject, ''), v_body)
  on conflict (gym_id, member_id, rule_key, channel, scheduled_date) do nothing
  returning id into v_id;

  return v_id;
end;
$$;


-- ── seeding a new gym ───────────────────────────────────────────────────────

/*
  Every gym starts with the ladder from §2.5 and workable copy. An owner who
  has to author seven templates before the engine does anything will never
  turn it on.
*/
create or replace function seed_gym_reminders(p_gym_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
begin
  for r in
    select * from (values
      ('expiry_30d', -30, 'Hi {{name}}, your {{plan}} membership at {{gym}} runs to {{expiry}} — 30 days away. Renew early and keep your streak going.'),
      ('expiry_15d', -15, 'Hi {{name}}, 15 days left on your {{plan}} membership at {{gym}}. Renew whenever suits you.'),
      ('expiry_7d',   -7, 'Hi {{name}}! Your gym membership expires in 7 days. Renew now to continue your workouts without interruption.'),
      ('expiry_3d',   -3, 'Hi {{name}}, only 3 days left on your membership at {{gym}}. Renew to avoid a break.'),
      ('expiry_1d',   -1, 'Hi {{name}}, your membership expires tomorrow. Renew today and nothing changes.'),
      ('expiry_0d',    0, 'Hi {{name}}, your membership at {{gym}} expires today. Renew to check in tomorrow.'),
      ('expired_3d',   3, 'Hi {{name}}, your membership lapsed 3 days ago. Renew now and pick up where you left off.')
    ) as t(key, offs, body)
  loop
    insert into public.reminder_rules (gym_id, key, offset_days, channels)
    values (p_gym_id, r.key, r.offs, '{whatsapp,push}')
    on conflict (gym_id, key) do nothing;

    insert into public.message_templates (gym_id, key, channel, body)
    values (p_gym_id, r.key, 'whatsapp', r.body)
    on conflict (gym_id, key, channel) do nothing;

    insert into public.message_templates (gym_id, key, channel, body)
    values (p_gym_id, r.key, 'push', r.body)
    on conflict (gym_id, key, channel) do nothing;
  end loop;

  -- Inactivity (§2.7). Not tied to expiry, so no offset rule row.
  insert into public.message_templates (gym_id, key, channel, body) values
    (p_gym_id, 'inactive_7d',  'whatsapp',
     'Hi {{name}}, we haven''t seen you at {{gym}} for a week. Your workout is waiting.'),
    (p_gym_id, 'inactive_14d', 'whatsapp',
     'Hi {{name}}, it''s been two weeks. Come back in — your trainer has your plan ready.')
  on conflict (gym_id, key, channel) do nothing;
end;
$$;


-- ── RLS ─────────────────────────────────────────────────────────────────────

select private.apply_tenant_rls('message_templates',   'messaging');
select private.apply_tenant_rls('reminder_rules',      'messaging');
select private.apply_tenant_rls('notification_outbox', 'messaging');

create trigger message_templates_touch before update on message_templates
  for each row execute function private.touch_updated_at();
create trigger notification_outbox_touch before update on notification_outbox
  for each row execute function private.touch_updated_at();
