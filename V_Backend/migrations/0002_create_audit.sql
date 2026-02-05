CREATE TABLE IF NOT EXISTS audit (
  auditId TEXT PRIMARY KEY,
  createdAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  actorUserId TEXT NOT NULL,
  subjectMemberId TEXT,
  action TEXT NOT NULL,
  targetType TEXT,
  targetId TEXT,
  meta TEXT
);

CREATE INDEX IF NOT EXISTS idx_audit_createdAt ON audit(createdAt DESC);
CREATE INDEX IF NOT EXISTS idx_audit_actorUserId ON audit(actorUserId, createdAt DESC);
CREATE INDEX IF NOT EXISTS idx_audit_subjectMemberId ON audit(subjectMemberId, createdAt DESC);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit(action, createdAt DESC);
