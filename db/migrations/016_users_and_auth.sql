-- Users table (OAuth only, no passwords)
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  github_id TEXT UNIQUE,
  google_id TEXT UNIQUE,
  email TEXT,
  name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Sessions for cookie-based auth
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_sessions_user_id ON sessions(user_id);
CREATE INDEX idx_sessions_expires_at ON sessions(expires_at);

-- Track which tools each user owns
CREATE TABLE user_tools (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tool_id INTEGER NOT NULL REFERENCES tools(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, tool_id)
);

-- Recipes belong to users (nullable for existing recipes)
ALTER TABLE recipes ADD COLUMN user_id INTEGER REFERENCES users(id) ON DELETE SET NULL;
