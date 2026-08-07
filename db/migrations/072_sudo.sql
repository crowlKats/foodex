-- Sudo: an admin's session can temporarily act as another user to fix their
-- data. Stored on the session row so it is server-controlled, revocable, and
-- dies with the session; it is only honored while the session's real user is
-- still an admin.
ALTER TABLE sessions ADD COLUMN sudo_user_id UUID REFERENCES users(id) ON DELETE SET NULL;
