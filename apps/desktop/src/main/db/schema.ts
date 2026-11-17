/** Version 1 schema. Timestamps are ISO-8601 UTC strings. */
export const V1_SCHEMA = `
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  mode TEXT NOT NULL DEFAULT 'dictate',
  app_name TEXT,
  app_icon TEXT,
  prompt TEXT NOT NULL DEFAULT '',
  reply TEXT NOT NULL DEFAULT '',
  tool TEXT,
  duration_seconds REAL,
  word_count INTEGER NOT NULL DEFAULT 0,
  language TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE turns (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  sequence INTEGER NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  tool_name TEXT,
  created_at TEXT NOT NULL,
  UNIQUE(session_id, sequence)
);

CREATE TABLE session_insights (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  source_updated_at TEXT NOT NULL,
  metrics_json TEXT NOT NULL
);

CREATE INDEX sessions_user_created_idx ON sessions(user_id, created_at DESC);
CREATE INDEX sessions_deleted_idx ON sessions(deleted_at);
CREATE INDEX turns_session_sequence_idx ON turns(session_id, sequence);
CREATE INDEX session_insights_user_idx ON session_insights(user_id);
`
