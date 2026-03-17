-- Добавляем поля подписки в users
ALTER TABLE users ADD COLUMN subscription_expires_at TEXT DEFAULT NULL;
ALTER TABLE users ADD COLUMN trial_ends_at TEXT DEFAULT NULL;

-- Платежи ЮKassa
CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id),
  yukassa_payment_id TEXT UNIQUE,
  amount INTEGER NOT NULL,
  tier TEXT NOT NULL,
  months INTEGER NOT NULL DEFAULT 1,
  status TEXT DEFAULT 'pending',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_payments_user ON payments(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_yukassa ON payments(yukassa_payment_id);

-- Мониторинг URL
CREATE TABLE IF NOT EXISTS monitored_urls (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id),
  url TEXT NOT NULL,
  last_score INTEGER DEFAULT NULL,
  last_checked_at TEXT DEFAULT NULL,
  alert_threshold INTEGER DEFAULT 10,
  active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_monitors_user ON monitored_urls(user_id);
CREATE INDEX IF NOT EXISTS idx_monitors_active ON monitored_urls(active);
