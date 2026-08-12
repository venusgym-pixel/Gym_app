-- ============================================================================
-- 0004 · Attendance and QR check-in.
--
-- The highest-frequency action in the product, and the one that must never be
-- wrong: a paying member turned away at the door is worse than a lapsed member
-- let in. Every decision below leans that way.
-- ============================================================================

create table attendance (
  id            uuid primary key default gen_random_uuid(),
  gym_id        uuid not null references gyms(id) on delete cascade,
  member_id     uuid not null references members(id) on delete cascade,
  branch_id     uuid references branches(id) on delete set null,

  checked_in_at timestamptz not null default now(),
  method        checkin_method not null default 'qr',

  -- Who recorded it, for manual entries at the front desk (A-22).
  recorded_by   uuid references profiles(id) on delete set null,

  -- The member app queues check-ins while offline. The client sends a UUID it
  -- generated; replaying it is a no-op rather than a second visit.
  idempotency_key uuid,

  -- Snapshot of the membership state at the moment of entry. Reporting must
  -- not change retrospectively when a membership is later renewed or frozen.
  membership_id     uuid references memberships(id) on delete set null,
  membership_status membership_status,

  created_at    timestamptz not null default now()
);

create index attendance_gym_time_idx   on attendance (gym_id, checked_in_at desc);
create index attendance_gym_member_idx on attendance (gym_id, member_id, checked_in_at desc);

-- Offline replay protection. Partial, because most check-ins carry no key.
create unique index attendance_idempotency_idx
  on attendance (gym_id, idempotency_key)
  where idempotency_key is not null;


-- ── QR kiosk credentials ────────────────────────────────────────────────────

-- The kiosk is a tablet left on the reception counter. It must NOT hold a
-- staff session — anyone could pick it up and walk into the admin console.
-- It holds a device credential instead, and displays a token that rotates.
create table kiosk_devices (
  id           uuid primary key default gen_random_uuid(),
  gym_id       uuid not null references gyms(id) on delete cascade,
  branch_id    uuid references branches(id) on delete set null,
  name         text not null,
  -- HMAC key for the rotating display token. Never leaves the server.
  secret       text not null default encode(gen_random_bytes(32), 'hex'),
  is_active    boolean not null default true,
  last_seen_at timestamptz,
  created_at   timestamptz not null default now()
);

create index kiosk_devices_gym_idx on kiosk_devices (gym_id) where is_active;


-- ── check-in ────────────────────────────────────────────────────────────────

-- Two visits within this window are the same visit: someone re-scanning
-- because the first beep was missed, or stepping out to their car.
create or replace function private.recent_checkin_window()
returns interval language sql immutable as $$ select interval '30 minutes' $$;

/*
  The single entry point for recording a visit. Returns the outcome rather
  than raising, because the kiosk has to show the member something either way
  (K-02: "Welcome back" vs "Membership expired — see reception").

  outcome:
    'ok'         · recorded
    'duplicate'  · already checked in within the window; not recorded again
    'expired'    · membership lapsed
    'frozen'     · membership paused
    'none'       · no membership on file at all
*/
create or replace function record_checkin(
  p_gym_id          uuid,
  p_member_id       uuid,
  p_method          checkin_method default 'qr',
  p_recorded_by     uuid default null,
  p_idempotency_key uuid default null,
  p_branch_id       uuid default null
)
returns table (
  outcome        text,
  attendance_id  uuid,
  member_name    text,
  status         membership_status,
  expires_on     date,
  days_left      integer,
  streak         integer,
  visits_this_month integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member    public.members%rowtype;
  v_ms        public.memberships%rowtype;
  v_existing  uuid;
  v_att_id    uuid;
  v_outcome   text;
begin
  select * into v_member
    from public.members m
   where m.id = p_member_id and m.gym_id = p_gym_id;

  if not found then
    return query select 'none'::text, null::uuid, null::text,
                        null::public.membership_status, null::date,
                        null::integer, 0, 0;
    return;
  end if;

  -- Replay of a queued offline check-in: return the original, unchanged.
  if p_idempotency_key is not null then
    select a.id into v_existing
      from public.attendance a
     where a.gym_id = p_gym_id and a.idempotency_key = p_idempotency_key;
    if found then
      return query select 'duplicate'::text, v_existing, v_member.full_name,
                          null::public.membership_status, null::date,
                          null::integer,
                          public.attendance_streak(p_gym_id, p_member_id),
                          public.visits_this_month(p_gym_id, p_member_id);
      return;
    end if;
  end if;

  /*
    Deliberately includes 'expired' memberships. The kiosk has to tell
    "your membership lapsed — renew" apart from "we have no record of you"
    (K-02 vs M-10): the first gets a Renew button, the second gets reception.
    Filtering expired rows out here would collapse both into 'none'.

    Cancelled is excluded — that member left, and their old membership should
    not resurface at the door months later.
  */
  select * into v_ms
    from public.memberships ms
   where ms.member_id = p_member_id
     and ms.gym_id = p_gym_id
     and ms.status <> 'cancelled'
   order by ms.expires_on desc
   limit 1;

  if not found then
    v_outcome := 'none';
  elsif v_ms.status = 'frozen' then
    v_outcome := 'frozen';
  elsif v_ms.expires_on < current_date or v_ms.status = 'expired' then
    v_outcome := 'expired';
  else
    v_outcome := 'ok';
  end if;

  if v_outcome <> 'ok' then
    return query select v_outcome, null::uuid, v_member.full_name,
                        v_ms.status, v_ms.expires_on,
                        (v_ms.expires_on - current_date)::integer,
                        public.attendance_streak(p_gym_id, p_member_id),
                        public.visits_this_month(p_gym_id, p_member_id);
    return;
  end if;

  -- Same visit, second scan.
  select a.id into v_existing
    from public.attendance a
   where a.gym_id = p_gym_id
     and a.member_id = p_member_id
     and a.checked_in_at > now() - private.recent_checkin_window()
   order by a.checked_in_at desc
   limit 1;

  if found then
    return query select 'duplicate'::text, v_existing, v_member.full_name,
                        v_ms.status, v_ms.expires_on,
                        (v_ms.expires_on - current_date)::integer,
                        public.attendance_streak(p_gym_id, p_member_id),
                        public.visits_this_month(p_gym_id, p_member_id);
    return;
  end if;

  insert into public.attendance
    (gym_id, member_id, branch_id, method, recorded_by,
     idempotency_key, membership_id, membership_status)
  values
    (p_gym_id, p_member_id, p_branch_id, p_method, p_recorded_by,
     p_idempotency_key, v_ms.id, v_ms.status)
  returning id into v_att_id;

  return query select 'ok'::text, v_att_id, v_member.full_name,
                      v_ms.status, v_ms.expires_on,
                      (v_ms.expires_on - current_date)::integer,
                      public.attendance_streak(p_gym_id, p_member_id),
                      public.visits_this_month(p_gym_id, p_member_id);
end;
$$;


-- ── streaks and counts ──────────────────────────────────────────────────────

/*
  Consecutive days ending today or yesterday. Yesterday counts so the streak
  does not visibly reset at midnight for someone who trains every evening —
  it breaks only once a full day has been missed.
*/
create or replace function attendance_streak(p_gym_id uuid, p_member_id uuid)
returns integer
language sql stable
set search_path = ''
as $$
  with days as (
    select distinct (a.checked_in_at at time zone 'Asia/Kolkata')::date as d
      from public.attendance a
     where a.gym_id = p_gym_id and a.member_id = p_member_id
  ),
  ranked as (
    select d, d - (row_number() over (order by d desc))::integer * interval '1 day' as grp
      from days
  ),
  runs as (
    select grp, count(*)::integer as len, max(d) as ends_on
      from ranked group by grp
  )
  select coalesce(
    (select len from runs
      where ends_on >= (current_date - 1)
      order by ends_on desc limit 1),
    0);
$$;

create or replace function visits_this_month(p_gym_id uuid, p_member_id uuid)
returns integer
language sql stable
set search_path = ''
as $$
  select count(*)::integer
    from public.attendance a
   where a.gym_id = p_gym_id
     and a.member_id = p_member_id
     and a.checked_in_at >= date_trunc('month', current_date);
$$;

-- Days since last visit. Null means never — which is NOT the same as "a long
-- time ago", and the inactivity scan must not treat it as such.
create or replace function days_since_last_visit(p_gym_id uuid, p_member_id uuid)
returns integer
language sql stable
set search_path = ''
as $$
  select (current_date - max(a.checked_in_at)::date)::integer
    from public.attendance a
   where a.gym_id = p_gym_id and a.member_id = p_member_id;
$$;


-- ── RLS ─────────────────────────────────────────────────────────────────────

select private.apply_tenant_rls('attendance',    'attendance');
select private.apply_tenant_rls('kiosk_devices', 'settings');

-- A member reads their own history (M-11) without the gym-wide grant.
create policy attendance_select_self on attendance for select to authenticated
  using (
    gym_id = (select auth_gym_id())
    and exists (
      select 1 from members m
      where m.id = attendance.member_id
        and m.user_id = (select auth.uid())
    )
  );

revoke execute on function record_checkin(uuid, uuid, checkin_method, uuid, uuid, uuid)
  from public, anon;
grant execute on function record_checkin(uuid, uuid, checkin_method, uuid, uuid, uuid)
  to authenticated, service_role;
