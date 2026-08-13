-- ============================================================================
-- 0011 · Let members read their own membership.
--
-- The generated tenant policies require scope = 'all' (migration 0001), which
-- is right: it stops a member with scope 'own' reading the whole gym. But it
-- also meant a member could not read their OWN membership, so the member app
-- showed "No active membership" to everyone — including people whose
-- membership was perfectly valid.
--
-- The same gap applied to membership_freezes. Payments, invoices and
-- attendance already had explicit self-policies; these complete the set.
--
-- Found by signing in as a real member and looking at the screen. The
-- isolation suite could not catch it: it proves a member cannot see OTHER
-- people's rows, and a policy that returns nothing at all passes that test
-- perfectly.
-- ============================================================================

create policy memberships_select_self on memberships for select to authenticated
  using (
    gym_id = (select auth_gym_id())
    and exists (
      select 1 from members m
      where m.id = memberships.member_id
        and m.user_id = (select auth.uid())
    )
  );

create policy membership_freezes_select_self on membership_freezes
  for select to authenticated
  using (
    gym_id = (select auth_gym_id())
    and exists (
      select 1 from memberships ms
      join members m on m.id = ms.member_id
      where ms.id = membership_freezes.membership_id
        and m.user_id = (select auth.uid())
    )
  );
