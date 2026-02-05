CREATE TABLE IF NOT EXISTS user_settings (
  userId TEXT PRIMARY KEY,
  syncEnabled INTEGER NOT NULL DEFAULT 0,
  updatedAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS user_profile_secure (
  userId TEXT PRIMARY KEY,
  encryptedJson TEXT NOT NULL,
  keyVersion INTEGER NOT NULL DEFAULT 1,
  updatedAt TEXT NOT NULL
);
