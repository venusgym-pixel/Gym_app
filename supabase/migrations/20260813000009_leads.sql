-- ============================================================================
-- 0016 · Leads (A-25 … A-29).
--
-- The walk-in who asked about prices on Tuesday and was never called back is
-- the single biggest leak in a small gym. The whole point of this table is
-- that the follow-up date is a column, so "who am I chasing today" is a query
-- rather than someone's memory.
--
-- Two tables:
--   leads            — the person and where they are in the pipeline
--   lead_activities  — what was said and when, append-only
--
-- Conversion writes a real member row and stamps converted_member_id, so the
-- lead is never deleted: the source that produced a paying member is the only
-- reliable input to "where should I spend on marketing".
-- ============================================================================

create type lead_status as enum (
  'new',          -- captured, nobody has called yet
  'contacted',    -- spoken to, no visit booked
  'trial_booked', -- coming in on trial_on
  'trial_done',   -- visited, deciding
  'won',          -- became a member
  'lost'          -- said no, or went quiet
);

create table leads (
  id          uuid primary key default gen_random_uuid(),
  gym_id      uuid not null references gyms(id) on delete cascade,

  full_name   text not null,
  phone       text not null,
  email       citext,

  -- Free text rather than an enum: every gym has its own channels, and a
  -- gym typing "Instagram reel — Feb offer" is more useful than forcing them
  -- into a fixed list they will misuse.
  source      text,
  status      lead_status not null default 'new',

  -- What they asked about. Nullable: most walk-ins ask "how much is it".
  interested_plan_id uuid references plans(id) on delete set null,
  quoted_paise bigint check (quoted_paise is null or quoted_paise >= 0),

  assigned_to uuid references profiles(id) on delete set null,
  trial_on    date,

  -- The reason this table exists. Indexed below.
  next_follow_up_on date,

  notes       text,
  lost_reason text,

  converted_member_id uuid references members(id) on delete set null,
  converted_at        timestamptz,

  created_by  uuid references profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  -- Same person enquiring twice is one lead, updated. Per gym, like members:
  -- a phone number belongs to a person, not to the platform.
  unique (gym_id, phone)
);

-- The worklist query: open leads due today or overdue, oldest first.
create index leads_follow_up_idx
  on leads (gym_id, next_follow_up_on)
  where status not in ('won', 'lost');

create index leads_status_idx on leads (gym_id, status);

create table lead_activities (
  id        uuid primary key default gen_random_uuid(),
  gym_id    uuid not null references gyms(id) on delete cascade,
  lead_id   uuid not null references leads(id) on delete cascade,

  kind      text not null default 'note'
              check (kind in ('note', 'call', 'whatsapp', 'visit', 'status')),
  body      text not null,

  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

-- gym_id leads the index, not lead_id: every RLS policy filters on it first,
-- and the isolation suite fails any tenant table where it does not. The lead
-- and timestamp follow, which is the timeline query on the leads page.
create index lead_activities_lead_idx
  on lead_activities (gym_id, lead_id, created_at desc);

select private.apply_tenant_rls('leads', 'leads');
select private.apply_tenant_rls('lead_activities', 'leads');

create trigger leads_touch before update on leads
  for each row execute function private.touch_updated_at();


-- ── conversion ──────────────────────────────────────────────────────────────
--
-- Creating the member and closing the lead must be one transaction: a member
-- created from a lead that then stays open gets called again next week by
-- someone reading the follow-up list, which is worse than not calling at all.
--
-- SECURITY INVOKER: the caller needs both leads.edit and members.create, and
-- RLS on each insert is what checks that. Nothing here grants anything.

create or replace function convert_lead(
  p_lead_id uuid,
  p_member_code text default null
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_lead   public.leads%rowtype;
  v_code   text;
  v_member uuid;
begin
  select * into v_lead from public.leads l where l.id = p_lead_id;
  if not found then
    raise exception 'lead not found';   -- or RLS hid it, which is the same answer
  end if;

  if v_lead.converted_member_id is not null then
    return v_lead.converted_member_id;  -- idempotent: a double-click is not two members
  end if;

  -- Reuse an existing member with that phone rather than colliding with the
  -- (gym_id, phone) unique index. A lapsed member re-enquiring is common.
  select m.id into v_member
    from public.members m
   where m.gym_id = v_lead.gym_id and m.phone = v_lead.phone;

  if v_member is null then
    v_code := coalesce(
      p_member_code,
      'M-' || lpad(
        (coalesce((
          select max(nullif(regexp_replace(m.member_code, '\D', '', 'g'), '')::int)
            from public.members m where m.gym_id = v_lead.gym_id
        ), 0) + 1)::text, 3, '0')
    );

    insert into public.members (gym_id, member_code, full_name, phone, email, notes)
    values (
      v_lead.gym_id, v_code, v_lead.full_name, v_lead.phone, v_lead.email,
      nullif(concat_ws(' · ', 'From lead', v_lead.source, v_lead.notes), 'From lead')
    )
    returning id into v_member;
  end if;

  update public.leads
     set status = 'won',
         converted_member_id = v_member,
         converted_at = now(),
         next_follow_up_on = null
   where id = p_lead_id;

  insert into public.lead_activities (gym_id, lead_id, kind, body, created_by)
  values (v_lead.gym_id, p_lead_id, 'status',
          'Converted to member', (select auth.uid()));

  return v_member;
end;
$$;

comment on function convert_lead(uuid, text) is
  'A-29. Creates the member and closes the lead in one transaction. Idempotent.';

grant execute on function convert_lead(uuid, text) to authenticated;
