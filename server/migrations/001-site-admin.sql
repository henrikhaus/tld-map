CREATE TABLE site_admin (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
  user_id TEXT NOT NULL UNIQUE REFERENCES user(id) ON DELETE CASCADE
);
CREATE TABLE site_reports (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK(kind IN ('issue','feature')),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  contact TEXT NOT NULL DEFAULT '',
  user_id TEXT REFERENCES user(id) ON DELETE SET NULL,
  page TEXT NOT NULL,
  map_id TEXT,
  status TEXT NOT NULL DEFAULT 'new' CHECK(status IN ('new','planned','in-progress','resolved','closed')),
  admin_notes TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX site_reports_status_created ON site_reports(status, created_at);
CREATE TABLE site_visits (
  id TEXT PRIMARY KEY,
  started_at INTEGER NOT NULL,
  last_seen INTEGER NOT NULL,
  device TEXT NOT NULL,
  referrer TEXT NOT NULL
);
CREATE TABLE site_events (
  id TEXT PRIMARY KEY,
  visit_id TEXT NOT NULL REFERENCES site_visits(id) ON DELETE CASCADE,
  page TEXT NOT NULL,
  map_id TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX site_events_created ON site_events(created_at);
CREATE INDEX site_events_visit ON site_events(visit_id);
CREATE TABLE site_user_activity (
  user_id TEXT PRIMARY KEY REFERENCES user(id) ON DELETE CASCADE,
  last_seen INTEGER NOT NULL
);
