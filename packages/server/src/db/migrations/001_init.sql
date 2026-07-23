CREATE TABLE projects (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  created_at  TEXT NOT NULL
);

CREATE TABLE api_keys (
  id          TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  label       TEXT NOT NULL,
  key_hash    TEXT NOT NULL UNIQUE,
  key_prefix  TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  revoked_at  TEXT
);

CREATE TABLE feedbacks (
  id           TEXT PRIMARY KEY,
  project_id   TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  content      TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'new',
  app_version  TEXT,
  platform     TEXT,
  os_version   TEXT,
  device_model TEXT,
  user_ref     TEXT,
  api_key_id   TEXT REFERENCES api_keys(id) ON DELETE SET NULL,
  created_at   TEXT NOT NULL
);
CREATE INDEX idx_feedbacks_project_status ON feedbacks(project_id, status, created_at DESC);

CREATE TABLE admin_credentials (
  id             INTEGER PRIMARY KEY CHECK (id = 1),
  password_hash  TEXT NOT NULL,
  created_at     TEXT NOT NULL
);

CREATE TABLE admin_sessions (
  token_hash  TEXT PRIMARY KEY,
  created_at  TEXT NOT NULL,
  expires_at  TEXT NOT NULL
);
