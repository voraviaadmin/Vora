CREATE TABLE IF NOT EXISTS profile_settings (
  userId TEXT PRIMARY KEY,
  -- privacy is default; sync is opt-in
  mode TEXT NOT NULL CHECK (mode IN ('privacy', 'sync')) DEFAULT 'privacy',

  -- encrypted JSON blob (only used in sync mode or for server-side scoring preferences)
  encProfile TEXT,

  createdAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updatedAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_profile_settings_userId ON profile_settings(userId);
