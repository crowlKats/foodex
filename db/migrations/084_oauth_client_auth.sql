-- private_key_jwt client authentication for OAuth clients such as ChatGPT,
-- which sign token requests with a key published in their metadata.
--
-- A grant remembers how its client authenticated when the code was
-- redeemed. A grant made with a signed assertion only refreshes with one,
-- so its refresh token alone is useless to whoever steals it. Grants from
-- before this, and public clients, have 'none' semantics.

ALTER TABLE api_tokens
  -- 'none' or 'private_key_jwt'; null for a personal token.
  ADD COLUMN client_auth TEXT;

ALTER TABLE oauth_codes
  -- Set when the client's metadata rules out the public flow, so the code
  -- is only redeemed together with a signed assertion.
  ADD COLUMN client_auth_required BOOLEAN NOT NULL DEFAULT false;
