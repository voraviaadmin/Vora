type Db = any;

export type DailyContractRow = {
  id: string;
  userId: string;
  subjectMemberId: string;
  dayKey: string;
  syncMode: "sync" | "privacy";
  status: "draft" | "active" | "completed" | "failed" | "expired";
  createdAt: string;
  updatedAt: string;
  acceptedAt?: string | null;
  completedAt?: string | null;

  kind: string;
  title: string;
  statement: string;
  why?: string | null;

  metricName: string;
  metricOp: string;
  metricTarget: number;
  metricUnit: string;

  progressCurrent: number;
  progressTarget: number;
  progressPct: number;

  lockCuisine?: string | null;
  adjustedTarget?: number | null;
  swappedMetric: number;

  playbookJson?: string | null;
  derivationJson?: string | null;
};

export function getDailyContract(db: Db, args: {
  userId: string;
  subjectMemberId: string;
  dayKey: string;
  syncMode: "sync" | "privacy";
}): DailyContractRow | null {
  return db.prepare(`
    SELECT *
    FROM daily_contracts
    WHERE userId = ?
      AND subjectMemberId = ?
      AND dayKey = ?
      AND syncMode = ?
    LIMIT 1
  `).get(args.userId, args.subjectMemberId, args.dayKey, args.syncMode) as DailyContractRow | null;
}

export function insertDailyContract(db: Db, row: DailyContractRow) {
  db.prepare(`
    INSERT INTO daily_contracts (
      id, userId, subjectMemberId, dayKey, syncMode,
      status, createdAt, updatedAt, acceptedAt, completedAt,
      kind, title, statement, why,
      metricName, metricOp, metricTarget, metricUnit,
      progressCurrent, progressTarget, progressPct,
      lockCuisine, adjustedTarget, swappedMetric,
      playbookJson, derivationJson
    ) VALUES (
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?,
      ?, ?, ?,
      ?, ?
    )
  `).run(
    row.id, row.userId, row.subjectMemberId, row.dayKey, row.syncMode,
    row.status, row.createdAt, row.updatedAt, row.acceptedAt ?? null, row.completedAt ?? null,
    row.kind, row.title, row.statement, row.why ?? null,
    row.metricName, row.metricOp, row.metricTarget, row.metricUnit,
    row.progressCurrent, row.progressTarget, row.progressPct,
    row.lockCuisine ?? null, row.adjustedTarget ?? null, row.swappedMetric ?? 0,
    row.playbookJson ?? null, row.derivationJson ?? null
  );
}

export function updateDailyContractStatus(db: Db, args: {
  id: string;
  status: DailyContractRow["status"];
  acceptedAt?: string | null;
  completedAt?: string | null;
  nowIso: string;
}) {
  db.prepare(`
    UPDATE daily_contracts
    SET status = ?,
        acceptedAt = COALESCE(?, acceptedAt),
        completedAt = COALESCE(?, completedAt),
        updatedAt = ?
    WHERE id = ?
  `).run(args.status, args.acceptedAt ?? null, args.completedAt ?? null, args.nowIso, args.id);
}

export function updateDailyContractProgress(db: Db, args: {
  id: string;
  current: number;
  target: number;
  pct: number;
  nowIso: string;
}) {
  db.prepare(`
    UPDATE daily_contracts
    SET progressCurrent = ?,
        progressTarget = ?,
        progressPct = ?,
        updatedAt = ?
    WHERE id = ?
  `).run(args.current, args.target, args.pct, args.nowIso, args.id);
}

export function updateDailyContractAdjustments(db: Db, args: {
  id: string;
  adjustedTarget?: number | null;
  lockCuisine?: string | null;
  swappedMetric?: number;
  nowIso: string;
}) {
  db.prepare(`
    UPDATE daily_contracts
    SET adjustedTarget = COALESCE(?, adjustedTarget),
        lockCuisine = COALESCE(?, lockCuisine),
        swappedMetric = COALESCE(?, swappedMetric),
        updatedAt = ?
    WHERE id = ?
  `).run(
    args.adjustedTarget ?? null,
    args.lockCuisine ?? null,
    typeof args.swappedMetric === "number" ? args.swappedMetric : null,
    args.nowIso,
    args.id
  );
}
