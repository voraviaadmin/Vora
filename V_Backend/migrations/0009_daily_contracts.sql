CREATE TABLE IF NOT EXISTS daily_contracts (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL,
  subjectMemberId TEXT NOT NULL,
  dayKey TEXT NOT NULL,                 -- YYYY-MM-DD local day
  syncMode TEXT NOT NULL,               -- 'sync' | 'privacy'

  status TEXT NOT NULL,                 -- draft | active | completed | failed | expired
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  acceptedAt TEXT,
  completedAt TEXT,

  kind TEXT NOT NULL,                   -- macro_gap | decision | execution

  title TEXT NOT NULL,
  statement TEXT NOT NULL,
  why TEXT,

  metricName TEXT NOT NULL,             -- protein_g | fiber_g | calories_kcal | clean_meals
  metricOp TEXT NOT NULL,               -- >= | <= | ==
  metricTarget REAL NOT NULL,
  metricUnit TEXT NOT NULL,             -- g | kcal | count

  progressCurrent REAL NOT NULL DEFAULT 0,
  progressTarget REAL NOT NULL DEFAULT 0,
  progressPct REAL NOT NULL DEFAULT 0,

  lockCuisine TEXT,
  -- bounded adjustment tracking
  adjustedTarget REAL,
  swappedMetric INTEGER NOT NULL DEFAULT 0,

  -- store derivation/playbook for audit/debug
  playbookJson TEXT,
  derivationJson TEXT
);

CREATE INDEX IF NOT EXISTS idx_daily_contracts_lookup
ON daily_contracts(userId, subjectMemberId, dayKey, syncMode);
