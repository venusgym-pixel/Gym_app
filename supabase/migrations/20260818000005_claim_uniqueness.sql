-- ============================================================================
-- 0024 · Two ways the same money could be counted twice.
--
-- 1. TWO OUTSTANDING CLAIMS. The pay screen hides itself while a claim is
--    waiting, but that is presentation. Nothing stopped a second claim from a
--    direct API call, or from two taps on a slow connection — and reception,
--    seeing two cards, could approve both and extend the membership twice for
--    one payment.
--
-- 2. A REUSED UTR. The reference number on a UPI payment is unique per
--    transaction, which makes it the one part of a screenshot that cannot be
--    honestly repeated. Industry guidance for Indian merchants is to match
--    the UTR against the bank statement before releasing anything, precisely
--    because screenshots are trivially fabricated by cloned apps. Reusing
--    last month's reference is the cheapest possible fraud, so the database
--    refuses it outright.
--
-- Both are indexes rather than application checks, because the race they
-- prevent lives between a check and an insert.
-- ============================================================================

/* Only claims count. A member may have any number of settled payments, but
   at most one waiting to be looked at. */
create unique index payments_one_open_claim
  on payments (member_id)
  where status = 'awaiting_verification';

/* Per gym, and only where a reference was actually given — the field is
   optional, and NULLs must not collide with each other. Scoped to the gym
   rather than globally: two gyms genuinely can receive different payments
   whose references happen to match. */
create unique index payments_reference_once
  on payments (gym_id, reference)
  where reference is not null and reference <> '';
