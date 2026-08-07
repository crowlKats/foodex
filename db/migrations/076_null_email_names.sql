-- Magic-link signups used to get their email address as their display name.
-- Null those out so the /welcome step prompts them for a real one.
UPDATE users SET name = NULL WHERE name = email;
