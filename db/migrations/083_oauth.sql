-- OAuth for the MCP endpoint. An MCP client identifies itself with a Client
-- ID Metadata Document: its client_id is an HTTPS URL serving JSON that
-- names it and lists its redirect URIs, so there is no client registration
-- to store. What is stored is the grant.
--
-- An approved grant is an api_tokens row like a personal token, so the MCP
-- endpoint, the profile list and revocation treat both the same. The access
-- token expires and is renewed with a refresh token; both rotate on every
-- refresh. Personal tokens leave these columns null and never expire.

ALTER TABLE api_tokens
  -- The client's metadata URL; null for a personal token.
  ADD COLUMN client_id TEXT,
  ADD COLUMN expires_at TIMESTAMPTZ,
  -- SHA-256 of the current refresh token, hex.
  ADD COLUMN refresh_token_hash TEXT UNIQUE,
  -- A grant nobody has refreshed by then is dead and gets swept.
  ADD COLUMN refresh_expires_at TIMESTAMPTZ;

-- Authorization codes between the consent page and the token endpoint.
-- Short-lived and single use: redeeming one deletes it.
CREATE TABLE oauth_codes (
  -- SHA-256 of the code, hex.
  code_hash TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_id TEXT NOT NULL,
  -- The client_name from its metadata, becomes the token's name.
  client_name TEXT NOT NULL,
  redirect_uri TEXT NOT NULL,
  -- PKCE S256 challenge, base64url.
  code_challenge TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL
);
