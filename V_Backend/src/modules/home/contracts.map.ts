import type { DailyContract } from "../../intelligence/dailyContract";
import type { DailyContractRow } from "./contracts.store";

export function contractToRow(args: {
  c: DailyContract;
  userId: string;
  subjectMemberId: string;
  dayKey: string;
  syncMode: "sync" | "privacy";
  nowIso: string;
  derivation?: any;
}): DailyContractRow {
  const { c, userId, subjectMemberId, dayKey, syncMode, nowIso, derivation } = args;

  return {
    id: c.id,
    userId,
    subjectMemberId,
    dayKey,
    syncMode,
    status: c.status,
    createdAt: nowIso,
    updatedAt: nowIso,
    acceptedAt: null,
    completedAt: null,

    kind: c.kind,
    title: c.title,
    statement: c.statement,
    why: c.why ?? null,

    metricName: c.metric.name,
    metricOp: c.metric.operator,
    metricTarget: c.metric.target,
    metricUnit: c.metric.unit,

    progressCurrent: c.progress.current,
    progressTarget: c.progress.target,
    progressPct: c.progress.pct,

    lockCuisine: (c as any).userAdjustments?.lockCuisine ?? null,
    adjustedTarget: null,
    swappedMetric: 0,

    playbookJson: JSON.stringify(c.playbook ?? []),
    derivationJson: JSON.stringify(derivation ?? null),
  };
}

export function rowToApi(row: DailyContractRow) {
  return {
    id: row.id,
    dayKey: row.dayKey,
    status: row.status,
    title: row.title,
    statement: row.statement,
    why: row.why ?? undefined,
    metric: {
      name: row.metricName,
      operator: row.metricOp,
      target: row.adjustedTarget ?? row.metricTarget,
      unit: row.metricUnit,
    },
    progress: {
      current: row.progressCurrent,
      target: row.adjustedTarget ?? row.progressTarget,
      pct: row.progressPct,
    },
    playbook: safeJson(row.playbookJson, []),
    adjustments: {
      lockCuisine: row.lockCuisine ?? null,
      swappedMetric: !!row.swappedMetric,
      adjustedTarget: row.adjustedTarget ?? null,
    },
  };
}

function safeJson(s: string | null | undefined, fallback: any) {
  if (!s) return fallback;
  try { return JSON.parse(s); } catch { return fallback; }
}
