-- Students who signed up before this release are never sent to the craft picker.
--
-- The picker now shows once, to anyone whose craft_interests is NULL (never
-- asked). Without this, every existing student who never answered would be
-- stopped by it on their next sign-in. An empty list means "asked, skipped":
-- they go straight to Home, and their Home simply isn't tailored to a craft.
-- New sign-ups after this migration still start at NULL and are asked once.
--
-- Touches only craft_interests (and updated_at, by trigger); no sign-in,
-- purchase or claim trigger listens to this column.
-- Undo: not needed; an empty list behaves exactly like a skipped picker.
update public.users
set craft_interests = '{}'
where craft_interests is null;
