-- Magic link tokens for email-based passwordless auth
CREATE TABLE magic_link_tokens (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_magic_link_tokens_email ON magic_link_tokens(email);
CREATE INDEX idx_magic_link_tokens_expires_at ON magic_link_tokens(expires_at);

-- Partial unique index on users.email so magic link can upsert by email
-- NULL emails (from OAuth users who didn't share email) won't conflict
CREATE UNIQUE INDEX idx_users_email_unique ON users(email) WHERE email IS NOT NULL;
