CREATE TABLE push_subscriptions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  household_id INTEGER NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  key_p256dh TEXT NOT NULL,
  key_auth TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_push_subscriptions_household ON push_subscriptions(household_id);
