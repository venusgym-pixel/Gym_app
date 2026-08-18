-- Narrow the UPI-reference uniqueness to the path that is actually untrusted.
--
-- The index added in 20260818000005 covered every payment row, but `reference`
-- is not one kind of thing. On a member's claim it is a UTR they copied from
-- their UPI app. At the desk the field is labelled "UPI reference, cheque
-- number — optional" and reception types whatever helps them remember: "cash",
-- "counter", a cheque number. Two people paying cash on the same afternoon
-- would collide, and record_payment_and_extend would raise rather than record
-- money the gym had already taken. Refusing to bank real cash is a worse
-- failure than the fraud the index was for.
--
-- So it now applies only where claimed_by is set — rows a member created about
-- themselves. A member could still reuse a UTR that reception typed by hand,
-- but that would be their own payment, and staff saw the money either way.
--
-- Matching is normalised, because "4512 3398 7712" and "451233987712" are the
-- same UTR and an unnormalised index is defeated by pressing space.

drop index if exists payments_reference_once;

create unique index payments_reference_once
  on payments (gym_id, upper(regexp_replace(reference, '[^A-Za-z0-9]', '', 'g')))
  where claimed_by is not null
    and reference is not null
    and regexp_replace(reference, '[^A-Za-z0-9]', '', 'g') <> '';
