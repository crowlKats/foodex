-- A household is shared data; it must survive the account that happened to
-- create it. Same for invites, where the cascade would also strand the empty
-- household an admin invite seeded. The creator link becomes informational.
ALTER TABLE households ALTER COLUMN created_by DROP NOT NULL;
ALTER TABLE households DROP CONSTRAINT households_created_by_fkey;
ALTER TABLE households ADD CONSTRAINT households_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE household_invites ALTER COLUMN created_by DROP NOT NULL;
ALTER TABLE household_invites DROP CONSTRAINT household_invites_created_by_fkey;
ALTER TABLE household_invites ADD CONSTRAINT household_invites_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
