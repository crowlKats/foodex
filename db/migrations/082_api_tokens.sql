-- Personal API tokens: a bearer credential a user mints on their profile so
-- an outside program (an MCP client such as Claude Code) can act as them.
-- Only a hash is stored; the secret is shown once at creation. The token
-- acts within whatever household the user is a member of at request time,
-- the same way a session does.

CREATE TABLE api_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- What the user called it ("Claude Code on the laptop").
  name TEXT NOT NULL,
  -- SHA-256 of the secret, hex.
  token_hash TEXT NOT NULL UNIQUE,
  -- The first characters of the secret, so a list can tell tokens apart.
  token_prefix TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ
);

CREATE INDEX idx_api_tokens_user ON api_tokens (user_id);
