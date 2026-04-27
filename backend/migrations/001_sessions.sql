-- backend/migrations/001_sessions.sql
-- Plan 4-A Block 1 Task 1.3.
-- Postgres-backed chat sessions, replacing the in-memory Map<sessionId, Message[]>.
-- JSONB on content lets us persist full Anthropic message shapes including
-- tool_use and tool_result blocks, fixing the Plan 2 deferred item about
-- tool_use_id pairing across turns.

CREATE TABLE sessions (
  id              VARCHAR(64) PRIMARY KEY,
  license_key     VARCHAR(64),                                 -- nullable for free-tier; FK added in 002_licenses.sql
  site_url        VARCHAR(255) NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_active_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  message_count   INT NOT NULL DEFAULT 0
);
CREATE INDEX sessions_active ON sessions(last_active_at);

CREATE TABLE session_messages (
  id          BIGSERIAL PRIMARY KEY,
  session_id  VARCHAR(64) NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  seq         INT NOT NULL,
  role        VARCHAR(16) NOT NULL,
  content     JSONB NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (session_id, seq)
);
CREATE INDEX session_messages_lookup ON session_messages(session_id, seq);
