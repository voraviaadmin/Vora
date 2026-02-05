-- 0001_init.sql
-- Walzia Studios / Voravia (Vora) - Foundation schema
-- Non-negotiables:
-- - memberId is canonical subject identity
-- - userId is authentication principal only (actor)
-- - All activity is attributed with actorUserId + subjectMemberId
-- - No provider lock-in for places: use placeRefId mapping
-- - Audit & usage are append-only
-- - Billing: separate member billing preference vs group subscription payer (typed ref)

PRAGMA foreign_keys = ON;

-- -----------------------------------------------------------------------------
-- Schema version tracking (forward-only migrations)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS schema_version (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  version TEXT NOT NULL,
  applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- -----------------------------------------------------------------------------
-- Members (canonical person identity)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS members (
  memberId TEXT PRIMARY KEY,
  displayName TEXT NOT NULL,
  createdAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updatedAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),

  -- Member billing preference (future-ready). Default = Self.
  -- Note: this is NOT the group subscription payer. This is the member’s preference/attribution.
  billingType TEXT NOT NULL DEFAULT 'Self'
    CHECK (billingType IN ('Self','FWGB','Insurance','Workplace')),

  -- Soft-delete support (compliance-ready)
  deletedAt TEXT
);

CREATE INDEX IF NOT EXISTS idx_members_deletedAt ON members(deletedAt);

-- -----------------------------------------------------------------------------
-- Users (auth principals) -> every user maps to exactly one member
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  userId TEXT PRIMARY KEY,
  memberId TEXT NOT NULL UNIQUE,
  createdAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updatedAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deletedAt TEXT,

  FOREIGN KEY (memberId) REFERENCES members(memberId)
);

CREATE INDEX IF NOT EXISTS idx_users_deletedAt ON users(deletedAt);

-- -----------------------------------------------------------------------------
-- Group Types & Billing Types (config tables, no demo data)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS group_types (
  groupType TEXT PRIMARY KEY,
  displayName TEXT NOT NULL,
  canCreateMembers INTEGER NOT NULL DEFAULT 0 CHECK (canCreateMembers IN (0,1)),
  canLogForOthers INTEGER NOT NULL DEFAULT 0 CHECK (canLogForOthers IN (0,1)),
  supportsGroupBilling INTEGER NOT NULL DEFAULT 0 CHECK (supportsGroupBilling IN (0,1))
);

CREATE TABLE IF NOT EXISTS billing_types (
  billingType TEXT PRIMARY KEY,
  displayName TEXT NOT NULL
);

-- Seed config (safe, non-demo)
INSERT OR IGNORE INTO group_types(groupType, displayName, canCreateMembers, canLogForOthers, supportsGroupBilling) VALUES
  ('FamilyWithBillingGroup','Family (Billing Group)',1,1,1),
  ('Family','Family',0,0,0),
  ('Individual','Individual',0,0,0),
  ('Workplace','Workplace',0,0,1),
  ('Insurance','Insurance',0,0,1);

INSERT OR IGNORE INTO billing_types(billingType, displayName) VALUES
  ('Self','Self'),
  ('FWGB','Family (Group Billing)'),
  ('Insurance','Insurance'),
  ('Workplace','Workplace');

-- -----------------------------------------------------------------------------
-- Groups (replaces prior “family table”) - generic groups for future expansion
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS groups (
  groupId TEXT PRIMARY KEY,
  groupType TEXT NOT NULL,
  name TEXT NOT NULL,
  createdByUserId TEXT NOT NULL,
  createdAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updatedAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deletedAt TEXT,

  FOREIGN KEY (groupType) REFERENCES group_types(groupType),
  FOREIGN KEY (createdByUserId) REFERENCES users(userId)
);

CREATE INDEX IF NOT EXISTS idx_groups_type ON groups(groupType);
CREATE INDEX IF NOT EXISTS idx_groups_deletedAt ON groups(deletedAt);

-- -----------------------------------------------------------------------------
-- Group membership (a member can belong to 1+ groups)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS group_members (
  groupId TEXT NOT NULL,
  memberId TEXT NOT NULL,

  role TEXT NOT NULL DEFAULT 'Member'
    CHECK (role IN ('Owner','Admin','Member')),

  joinedAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  leftAt TEXT,

  PRIMARY KEY (groupId, memberId),
  FOREIGN KEY (groupId) REFERENCES groups(groupId),
  FOREIGN KEY (memberId) REFERENCES members(memberId)
);

CREATE INDEX IF NOT EXISTS idx_group_members_member ON group_members(memberId);
CREATE INDEX IF NOT EXISTS idx_group_members_group ON group_members(groupId);

-- -----------------------------------------------------------------------------
-- Invites (for Create/Join flows)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS group_invites (
  inviteId TEXT PRIMARY KEY,
  groupId TEXT NOT NULL,
  createdByUserId TEXT NOT NULL,
  inviteCode TEXT NOT NULL UNIQUE,
  expiresAt TEXT,
  maxUses INTEGER,
  usesCount INTEGER NOT NULL DEFAULT 0,
  createdAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  revokedAt TEXT,

  FOREIGN KEY (groupId) REFERENCES groups(groupId),
  FOREIGN KEY (createdByUserId) REFERENCES users(userId)
);

CREATE INDEX IF NOT EXISTS idx_group_invites_group ON group_invites(groupId);
CREATE INDEX IF NOT EXISTS idx_group_invites_code ON group_invites(inviteCode);

-- -----------------------------------------------------------------------------
-- Group Subscription Billing (ONLY meaningful for FWGB + future Workplace/Insurance)
-- Effective-dated payer typed reference:
-- payerEntityType = Member | Insurance | Workplace
-- payerMemberId / payerOrgId used depending on type.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS group_billing (
  groupBillingId TEXT PRIMARY KEY,
  groupId TEXT NOT NULL,

  payerEntityType TEXT NOT NULL
    CHECK (payerEntityType IN ('Member','Insurance','Workplace')),

  payerMemberId TEXT,
  payerOrgId TEXT, -- for Insurance/Workplace future (opaque org id)

  effectiveFrom TEXT NOT NULL,
  effectiveTo TEXT, -- NULL = current

  createdByUserId TEXT NOT NULL,
  createdAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),

  FOREIGN KEY (groupId) REFERENCES groups(groupId),
  FOREIGN KEY (payerMemberId) REFERENCES members(memberId),
  FOREIGN KEY (createdByUserId) REFERENCES users(userId),

  CHECK (
    (payerEntityType = 'Member' AND payerMemberId IS NOT NULL AND payerOrgId IS NULL)
    OR
    (payerEntityType IN ('Insurance','Workplace') AND payerOrgId IS NOT NULL AND payerMemberId IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_group_billing_group ON group_billing(groupId);
CREATE INDEX IF NOT EXISTS idx_group_billing_effective ON group_billing(groupId, effectiveFrom, effectiveTo);

-- -----------------------------------------------------------------------------
-- Place refs mapping (no provider lock-in)
-- placeRefId is the only ID used by app/logs; provider IDs stay here
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS place_refs (
  placeRefId TEXT PRIMARY KEY,
  provider TEXT NOT NULL,           -- e.g. 'google', 'yelp', 'osm'
  providerPlaceId TEXT NOT NULL,
  createdAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updatedAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),

  UNIQUE (provider, providerPlaceId)
);

CREATE INDEX IF NOT EXISTS idx_place_refs_provider ON place_refs(provider);

-- -----------------------------------------------------------------------------
-- Logs (meals) - subjectMemberId is canonical
-- actorUserId is for audit trail only
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS logs (
  logId TEXT PRIMARY KEY,

  actorUserId TEXT NOT NULL,
  subjectMemberId TEXT NOT NULL,

  -- optional group context (if logged while in a group context)
  groupId TEXT,

  -- optional restaurant reference (provider-agnostic)
  placeRefId TEXT,

  mealType TEXT,          -- Breakfast/Lunch/Dinner/Snack etc (enum later)
  capturedAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),

  score INTEGER,          -- 0..100
  summary TEXT,           -- short user/ai summary

  createdAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updatedAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deletedAt TEXT,

  FOREIGN KEY (actorUserId) REFERENCES users(userId),
  FOREIGN KEY (subjectMemberId) REFERENCES members(memberId),
  FOREIGN KEY (groupId) REFERENCES groups(groupId),
  FOREIGN KEY (placeRefId) REFERENCES place_refs(placeRefId)
);

CREATE INDEX IF NOT EXISTS idx_logs_subject_time ON logs(subjectMemberId, capturedAt DESC);
CREATE INDEX IF NOT EXISTS idx_logs_group_time ON logs(groupId, capturedAt DESC);
CREATE INDEX IF NOT EXISTS idx_logs_deletedAt ON logs(deletedAt);

-- -----------------------------------------------------------------------------
-- Usage events (append-only) - for billing/analytics
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS usage_events (
  usageEventId TEXT PRIMARY KEY,

  actorUserId TEXT NOT NULL,
  subjectMemberId TEXT NOT NULL,
  groupId TEXT,

  feature TEXT NOT NULL,      -- e.g. scan_meal, ai_tip, places_search
  units INTEGER NOT NULL DEFAULT 1,

  createdAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),

  FOREIGN KEY (actorUserId) REFERENCES users(userId),
  FOREIGN KEY (subjectMemberId) REFERENCES members(memberId),
  FOREIGN KEY (groupId) REFERENCES groups(groupId)
);

CREATE INDEX IF NOT EXISTS idx_usage_subject_time ON usage_events(subjectMemberId, createdAt DESC);
CREATE INDEX IF NOT EXISTS idx_usage_group_time ON usage_events(groupId, createdAt DESC);
CREATE INDEX IF NOT EXISTS idx_usage_feature_time ON usage_events(feature, createdAt DESC);

-- -----------------------------------------------------------------------------
-- Audit events (append-only, compliance-ready)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_events (
  auditEventId TEXT PRIMARY KEY,

  actorUserId TEXT NOT NULL,
  action TEXT NOT NULL,            -- e.g. group.create, group.join, log.create, admin.read
  targetType TEXT,                 -- 'member','group','log','billing','invite', etc
  targetId TEXT,                   -- corresponding id

  requestId TEXT,                  -- correlation id
  ip TEXT,
  userAgent TEXT,

  -- Redacted JSON payload (keep minimal). Never store sensitive raw data.
  metadataJson TEXT,

  createdAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),

  FOREIGN KEY (actorUserId) REFERENCES users(userId)
);

CREATE INDEX IF NOT EXISTS idx_audit_actor_time ON audit_events(actorUserId, createdAt DESC);
CREATE INDEX IF NOT EXISTS idx_audit_action_time ON audit_events(action, createdAt DESC);

-- -----------------------------------------------------------------------------
-- Record migration applied
-- -----------------------------------------------------------------------------
INSERT OR REPLACE INTO schema_version(id, version) VALUES (1, '0001_init');
