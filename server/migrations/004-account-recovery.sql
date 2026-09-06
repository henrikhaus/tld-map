CREATE TABLE account_recovery (
  user_id TEXT PRIMARY KEY REFERENCES user(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE account_security_limits (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  expires INTEGER NOT NULL
);
