CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tg_id INTEGER UNIQUE,
  username TEXT,
  audits_this_month INTEGER DEFAULT 0,
  last_audit_reset TEXT DEFAULT (strftime('%Y-%m', 'now')),
  tier TEXT DEFAULT 'free',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS audits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id),
  url TEXT NOT NULL,
  score INTEGER,
  result_json TEXT,
  ai_recommendations TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_audits_user ON audits(user_id);
CREATE INDEX IF NOT EXISTS idx_audits_created ON audits(created_at);
