-- A scan of a printed wall poster is not the same evidence as a scan of a live
-- kiosk screen, and attendance reporting has to be able to tell them apart.
-- A rotating screen code proves someone was standing in the gym ninety seconds
-- ago; a printed one proves only that they have seen the poster at some point.
-- Recording both as 'qr' would average proof-of-presence together with
-- self-reported presence into a number nobody can interpret.
--
-- Alone in its own migration: ALTER TYPE ... ADD VALUE cannot be used in the
-- same transaction that adds it, and the apply script wraps each file in one.
alter type checkin_method add value if not exists 'poster';
