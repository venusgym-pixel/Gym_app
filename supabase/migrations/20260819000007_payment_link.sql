-- An optional hosted payment page.
--
-- Most gyms need nothing here: the UPI intent link is generated from upi_vpa,
-- carries the amount, and opens GPay or PhonePe directly. But some already run
-- a Razorpay or BharatPe payment page, and telling them to abandon it because
-- this app prefers its own link would be the app deciding how the gym takes
-- money.
--
-- Presented as a secondary route, never the primary one. A hosted page cannot
-- carry the plan's amount the way the intent link does, so the member types it
-- again — which is the retyping the payment audit found causing wrong amounts.
alter table gyms add column payment_link text;

comment on column gyms.payment_link is
  'Optional hosted payment page (Razorpay, BharatPe, a bank page). Shown to '
  'members as an alternative to the UPI intent link, which is preferred '
  'because it carries the amount.';
