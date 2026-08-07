-- Admin-issued invites seed a brand-new empty household: the invitee becomes
-- its owner and names it on arrival. invited_email records who the invite was
-- meant for; regular member invites leave both columns at their defaults.
ALTER TABLE household_invites ADD COLUMN invited_email TEXT;
ALTER TABLE household_invites ADD COLUMN grants_owner BOOLEAN NOT NULL DEFAULT false;
