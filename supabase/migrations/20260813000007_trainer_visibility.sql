-- ============================================================================
-- 0014 · Let a trainer see their clients' membership and attendance.
--
-- The trainer app listed four assigned clients and then reported "0 training
-- members" and "no recent check-ins", because scope 'assigned' gets nothing
-- from the generated policies (which require scope 'all') and no narrower
-- policy existed for these two tables.
--
-- Both are squarely a trainer's business:
--
--   · Membership status — a trainer planning next week for someone whose
--     membership lapses on Friday should know that before they write the plan.
--     Read-only: nothing here lets a trainer change a price or a date.
--
--   · Attendance — "have they actually been coming" is the first question
--     asked about a client who is not progressing.
--
-- Payments and invoices are deliberately NOT included. A trainer needs to
-- know whether a membership is live, not what was paid for it.
-- ============================================================================

create policy memberships_trainer on memberships for select to authenticated
  using (
    gym_id = (select auth_gym_id())
    and exists (
      select 1 from trainer_clients tc
      where tc.member_id = memberships.member_id
        and tc.trainer_id = (select auth.uid())
        and tc.ended_on is null
    )
  );

create policy attendance_trainer on attendance for select to authenticated
  using (
    gym_id = (select auth_gym_id())
    and exists (
      select 1 from trainer_clients tc
      where tc.member_id = attendance.member_id
        and tc.trainer_id = (select auth.uid())
        and tc.ended_on is null
    )
  );

-- The plan name shown against a client's membership comes from here.
create policy plans_trainer on plans for select to authenticated
  using (
    gym_id = (select auth_gym_id())
    and (select permission_scope('members')) = 'assigned'
  );
