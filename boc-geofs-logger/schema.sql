CREATE TABLE IF NOT EXISTS chat_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id TEXT,
  dedupe_key TEXT NOT NULL UNIQUE,
  timestamp TEXT NOT NULL,
  callsign TEXT,
  uid TEXT,
  aircraft_id TEXT,
  message TEXT NOT NULL,
  server TEXT NOT NULL,
  created_at TEXT NOT NULL,
  moderation_flagged INTEGER NOT NULL DEFAULT 0,
  moderation_reason TEXT,
  moderation_reviewed INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_chat_timestamp ON chat_messages(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_chat_callsign ON chat_messages(callsign);
CREATE INDEX IF NOT EXISTS idx_chat_uid ON chat_messages(uid);
CREATE INDEX IF NOT EXISTS idx_chat_message ON chat_messages(message);
CREATE INDEX IF NOT EXISTS idx_chat_dedupe ON chat_messages(dedupe_key);
