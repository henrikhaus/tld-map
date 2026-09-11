ALTER TABLE site_reports ADD COLUMN guest_owner_hash TEXT;
CREATE TABLE site_report_notifications (
  id TEXT PRIMARY KEY,
  report_id TEXT NOT NULL UNIQUE REFERENCES site_reports(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX site_reports_user ON site_reports(user_id);
CREATE INDEX site_reports_guest ON site_reports(guest_owner_hash);
