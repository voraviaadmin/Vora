-- 0007_create_user_restaurant_menu_snapshot.sql
-- Latest scored menu snapshot per user + restaurant(placeRefId)
-- Overwrite on rescan. Retain 30 days. No raw OCR stored.

CREATE TABLE IF NOT EXISTS user_restaurant_menu_snapshot (
  userId TEXT NOT NULL,
  placeRefId TEXT NOT NULL,

  updatedAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  expiresAt TEXT NOT NULL,

  menuSource TEXT NOT NULL,          -- scan_upload | menu_url | provider_menu | items
  menuFingerprint TEXT NOT NULL,     -- hash of normalized item names
  confidence REAL NOT NULL DEFAULT 0,

  itemsJson TEXT NOT NULL,           -- JSON array of { itemId, name, scoreValue, scoreLabel, reasons[], flags[]? }

  PRIMARY KEY (userId, placeRefId)
);

CREATE INDEX IF NOT EXISTS idx_menu_snapshot_expires
  ON user_restaurant_menu_snapshot (expiresAt);

CREATE INDEX IF NOT EXISTS idx_menu_snapshot_user
  ON user_restaurant_menu_snapshot (userId);
