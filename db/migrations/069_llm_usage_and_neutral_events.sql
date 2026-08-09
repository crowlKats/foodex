-- Replace ocr_usage with llm_usage, and make the event log's stored format
-- provider-neutral.
--
-- ocr_usage was write-only: every call site inserted, nothing ever read it, and
-- its columns (input_tokens/output_tokens) stopped determining spend once
-- caching landed — a cached token bills at a fraction of an uncached one, and
-- the auto router's rate varies per request. llm_usage records the settled cost
-- instead, which is the number that was actually wanted.
DROP TABLE IF EXISTS ocr_usage;

CREATE TABLE llm_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- Null for calls not tied to a chat (substitutions, chat-title generation).
  -- Set null rather than cascade: usage history should outlive a deleted chat.
  session_id UUID REFERENCES agent_sessions(id) ON DELETE SET NULL,
  -- The model the router actually chose, not the id we requested.
  model TEXT NOT NULL,
  -- Null when the provider reported no cost, which is distinct from free.
  cost_usd NUMERIC(12, 8),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_llm_usage_user_id ON llm_usage(user_id, created_at DESC);
CREATE INDEX idx_llm_usage_session_id ON llm_usage(session_id);

-- Chat history is wiped: assistant turns were stored as Anthropic content
-- blocks, and those rows cannot be replayed against the neutral format that
-- replaces them. Sessions are conversational scratch space — applied recipes
-- and ingredients are real rows elsewhere and are untouched by this.
DELETE FROM agent_events;
DELETE FROM agent_sessions;

-- seq was BIGSERIAL: a single global sequence shared by every session, so
-- values were sparse and interleaved. Ordering worked, but "the Nth event of
-- this session" was not expressible and callers could not predict the next
-- value. Make it per-session, assigned inside the appending transaction.
ALTER TABLE agent_events ALTER COLUMN seq DROP DEFAULT;
DROP SEQUENCE IF EXISTS agent_events_seq_seq;
ALTER TABLE agent_events ADD CONSTRAINT agent_events_session_seq_unique
  UNIQUE (session_id, seq);
