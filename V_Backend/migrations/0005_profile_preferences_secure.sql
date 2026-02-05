CREATE TABLE IF NOT EXISTS user_profile_preferences_secure (
  userId TEXT PRIMARY KEY,
  encryptedJson TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);
