ALTER TABLE shopping_lists ADD COLUMN share_token_expires_at TIMESTAMPTZ;
ALTER TABLE collections ADD COLUMN share_token_expires_at TIMESTAMPTZ;

-- Existing tokens expire in 30 days from now
UPDATE shopping_lists SET share_token_expires_at = now() + interval '30 days' WHERE share_token IS NOT NULL;
UPDATE collections SET share_token_expires_at = now() + interval '30 days' WHERE share_token IS NOT NULL;
