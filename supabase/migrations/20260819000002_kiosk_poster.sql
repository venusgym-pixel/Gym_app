-- The printed code's identity.
--
-- A kiosk device already carries an HMAC secret for its rotating screen token.
-- A poster reuses that secret but signs a nonce instead of a time window, so
-- the sheet on the wall stays valid indefinitely — which is exactly what makes
-- it printable, and exactly what makes it weaker.
--
-- Rotating is therefore not a schedule but an act: the owner presses "print a
-- new one", this column changes, and every copy of the old sheet stops working
-- at once, including the photograph in someone's camera roll. Null means this
-- device has no poster and only drives a screen.
alter table kiosk_devices
  add column poster_nonce text,
  add column poster_printed_at timestamptz;

comment on column kiosk_devices.poster_nonce is
  'Identity of the currently valid printed poster for this device. Changing it '
  'invalidates every existing printout. Null when the device is screen-only.';
