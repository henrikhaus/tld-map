CREATE TABLE chat_people (
  id TEXT PRIMARY KEY,
  user_id TEXT UNIQUE REFERENCES user(id) ON DELETE SET NULL,
  guest_hash TEXT UNIQUE,
  guest_name TEXT UNIQUE,
  color TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  last_sent INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE chat_links (
  guest_id TEXT NOT NULL REFERENCES chat_people(id),
  account_id TEXT NOT NULL REFERENCES chat_people(id),
  PRIMARY KEY(guest_id, account_id)
);
CREATE TABLE chat_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  person_id TEXT NOT NULL REFERENCES chat_people(id),
  nonce TEXT NOT NULL,
  body TEXT NOT NULL,
  normalized TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  deleted INTEGER NOT NULL DEFAULT 0,
  UNIQUE(person_id, nonce)
);
CREATE INDEX chat_messages_person_created ON chat_messages(person_id, created_at);
CREATE TABLE chat_reactions (
  message_id INTEGER NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
  person_id TEXT NOT NULL REFERENCES chat_people(id),
  emoji TEXT NOT NULL,
  PRIMARY KEY(message_id, person_id, emoji)
);
CREATE TABLE chat_restrictions (
  person_id TEXT PRIMARY KEY REFERENCES chat_people(id),
  kind TEXT NOT NULL CHECK(kind IN ('timeout','ban')),
  until_at INTEGER,
  reason TEXT NOT NULL
);
CREATE TABLE chat_mod_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  person_id TEXT NOT NULL REFERENCES chat_people(id),
  admin_id TEXT NOT NULL REFERENCES user(id),
  action TEXT NOT NULL,
  reason TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE chat_flags (
  message_id INTEGER NOT NULL REFERENCES chat_messages(id),
  person_id TEXT NOT NULL REFERENCES chat_people(id),
  reason TEXT NOT NULL,
  resolved INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(message_id,person_id)
);
CREATE TABLE chat_limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires INTEGER NOT NULL);
CREATE TABLE chat_meta (id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER NOT NULL);
INSERT INTO chat_meta VALUES (1,0);
