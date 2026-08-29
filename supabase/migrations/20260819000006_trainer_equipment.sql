-- Trainers maintain the equipment list.
--
-- They already owned the exercise library, and an exercise points at an
-- equipment row — so a trainer could name a movement but not the machine it
-- is performed on, which made adding one kit a two-person job. They are also
-- the people standing on the floor when a cable snaps.
--
-- View and edit and create, not delete: retiring a machine writes it out of
-- every exercise that referenced it, and that stays with the owner.
--
-- Mirrors the TypeScript matrix in lib/auth/permissions.ts. Both exist because
-- has_permission() guards the database and can() guards the UI; they must be
-- changed together or a screen offers a button the row refuses.
update role_permissions
   set can_create = true,
       can_edit   = true
 where role = 'trainer'
   and module = 'equipment';
