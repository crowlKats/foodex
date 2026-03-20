-- Enforce one household per user
ALTER TABLE household_members ADD CONSTRAINT household_members_user_id_unique UNIQUE (user_id);
