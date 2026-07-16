-- Agentic recipe chat: per-user sessions backed by an append-only event log.
-- Staging and conversation are pure projections (folds) over agent_events;
-- nothing about the staging area is stored as independent mutable rows.

CREATE TABLE agent_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'New chat',
  -- Rollback head: events with seq > head_seq are logically truncated.
  -- NULL means the live head (no rollback in effect). Rollback can never move
  -- head_seq to or before the most recent `apply` event.
  head_seq BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_agent_sessions_user ON agent_sessions(user_id, updated_at DESC);

-- Ordered, append-only log. `seq` gives a global monotonic order; reads scope
-- to a session via WHERE session_id = $1 ORDER BY seq.
CREATE TABLE agent_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES agent_sessions(id) ON DELETE CASCADE,
  seq BIGSERIAL,
  type TEXT NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_agent_events_session ON agent_events(session_id, seq);

-- Ingredients need a concurrency token for the read-before-write guard;
-- they previously only had created_at.
ALTER TABLE ingredients ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
