import type { Request } from "express";
import { randomUUID } from "crypto";
import { writeAuditEvent } from "../../audit/audit";
import { buildMealContext } from "../profile/mealContext";
import { scoreMealContext } from "../../utils/scoring";
import { safeParseAiScoring, stringifyAiScoring } from "../scoring";
//import type { DailyConsumed } from "../../intelligence/engine";
//import type { Behavior14Day } from "../../intelligence/engine";


type MealType = "breakfast" | "lunch" | "dinner" | "snack";

export function getCtx(req: Request) {
  const anyReq = req as any;
  const ctx = anyReq.ctx ?? anyReq.context ?? anyReq.locals?.ctx;
  if (!ctx) throw new Error("CTX_MISSING");
  return ctx as {
    userId: string;
    memberId: string;
    activeMemberId: string;
    allowedMemberIds: string[];
    requestId: string;
  };
}

export function getDb(req: Request) {
  const anyReq = req as any;
  const db = anyReq.app?.locals?.db;
  if (!db) throw new Error("DB_MISSING");
  return db;
}

type DailyConsumed = {
  calories: number;
  protein_g: number;
  sugar_g: number;
  sodium_mg: number;
  fiber_g: number;
};

type Behavior14Day = {
  avgCalories: number;
  avgProtein_g: number;
  avgSodium_mg: number;
  avgSugar_g: number;
  avgFiber_g: number;

  highSodiumDaysPct: number; // 0..1
  lowProteinDaysPct: number; // 0..1

  commonCuisine?: string | null;
  lateEatingPct?: number;
};





function safeJsonParse(v: any): any | null {
  if (!v) return null;
  if (typeof v === "object") return v;
  if (typeof v === "string") {
    try { return JSON.parse(v); } catch { return null; }
  }
  return null;
}

function getEstimates(scoringJson: unknown): any | null {
  const sj = safeJsonParse(scoringJson);
  const e = sj?.estimates;
  return e && typeof e === "object" ? e : null;
}


function num(v: any): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Aggregate today's nutrition from log rows (scoringJson.estimates). Returns zeros if no data. */
export function computeTodayTotals(
  rows: Array<{ capturedAt?: string | null; scoringJson?: unknown }>
): DailyConsumed {
  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const todayStartIso = todayStart.toISOString();
  const tomorrowStartIso = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000).toISOString();

  let calories = 0, protein_g = 0, sugar_g = 0, sodium_mg = 0, fiber_g = 0;

  for (const r of rows) {
    const at = r.capturedAt;
    if (!at || at < todayStartIso || at >= tomorrowStartIso) continue;

    const e = getEstimates(r.scoringJson);
    if (!e) continue;

    calories += num(e.calories);
    protein_g += num(e.protein_g);
    sugar_g += num(e.sugar_g);
    sodium_mg += num(e.sodium_mg);
    fiber_g += num(e.fiber_g);
  }

  return { calories, protein_g, sugar_g, sodium_mg, fiber_g };
}

/** Build 14-day behavior summary from log rows. */
export function compute14DayBehavior(
  rows: Array<{ capturedAt?: string | null; scoringJson?: unknown }>,
  opts?: { sodiumMax_mg?: number; proteinTarget_g?: number }
): Behavior14Day | null {
  if (!rows.length) return null;

  const sodiumMax = opts?.sodiumMax_mg ?? 2300;
  const proteinTarget = opts?.proteinTarget_g ?? 110;
  const lowProteinCutoff = proteinTarget * 0.8;

  // per-day totals (YYYY-MM-DD)
  const perDay = new Map<string, { cal: number; pro: number; sod: number; sug: number; fib: number }>();

  let sumCal = 0, sumPro = 0, sumSod = 0, sumSug = 0, sumFib = 0;
  let nLogs = 0;

  for (const r of rows.slice(0, 800)) {
    if (!r.capturedAt) continue;
    const e = getEstimates(r.scoringJson);
    if (!e) continue;

    const cal = num(e.calories);
    const pro = num(e.protein_g);
    const sod = num(e.sodium_mg);
    const sug = num(e.sugar_g);
    const fib = num(e.fiber_g);

    sumCal += cal; sumPro += pro; sumSod += sod; sumSug += sug; sumFib += fib;
    nLogs++;

    const dayKey = r.capturedAt.slice(0, 10);
    const d = perDay.get(dayKey) ?? { cal: 0, pro: 0, sod: 0, sug: 0, fib: 0 };
    d.cal += cal; d.pro += pro; d.sod += sod; d.sug += sug; d.fib += fib;
    perDay.set(dayKey, d);
  }

  if (nLogs < 3) return null;

  const days = Array.from(perDay.values());
  const nDays = days.length;

  const highSodiumDays = days.filter(d => d.sod >= sodiumMax).length;
  const lowProteinDays = days.filter(d => d.pro <= lowProteinCutoff).length;

  return {
    avgCalories: Math.round(sumCal / nLogs),
    avgProtein_g: Math.round((sumPro / nLogs) * 10) / 10,
    avgSodium_mg: Math.round(sumSod / nLogs),
    avgSugar_g: Math.round((sumSug / nLogs) * 10) / 10,
    avgFiber_g: Math.round((sumFib / nLogs) * 10) / 10,
    highSodiumDaysPct: nDays ? highSodiumDays / nDays : 0,
    lowProteinDaysPct: nDays ? lowProteinDays / nDays : 0,
  };
}


function assertString(val: any, field: string, maxLen: number, optional = true) {
  if (val == null || val === "") {
    if (optional) return null;
    throw new Error(`INVALID_${field.toUpperCase()}`);
  }
  if (typeof val !== "string") throw new Error(`INVALID_${field.toUpperCase()}`);
  const s = val.trim();
  if (!s) return optional ? null : (() => { throw new Error(`INVALID_${field.toUpperCase()}`); })();
  if (s.length > maxLen) throw new Error(`INVALID_${field.toUpperCase()}`);
  return s;
}

function assertIsoDate(val: any, field: string, optional = true) {
  if (val == null || val === "") return optional ? null : (() => { throw new Error(`INVALID_${field.toUpperCase()}`); })();
  if (typeof val !== "string") throw new Error(`INVALID_${field.toUpperCase()}`);
  const s = val.trim();
  const d = new Date(s);
  if (!s || Number.isNaN(d.getTime())) throw new Error(`INVALID_${field.toUpperCase()}`);
  return new Date(d.getTime()).toISOString();
}

function parseLimit(val: any) {
  if (val == null) return 50;
  const n = Number(val);
  if (!Number.isFinite(n)) throw new Error("INVALID_LIMIT");
  const i = Math.trunc(n);
  if (i <= 0) throw new Error("INVALID_LIMIT");
  return Math.min(i, 200);
}

function normalizeMealType(raw: any): MealType | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim().toLowerCase();

  // canonical types
  if (v === "breakfast" || v === "lunch" || v === "dinner" || v === "snack") return v;

  // if frontend sends window labels, map them (repurpose-friendly)
  if (v === "morning") return "breakfast";
  if (v === "midday") return "lunch";
  if (v === "evening") return "dinner";
  if (v === "off-hours") return "snack";

  return null;
}

function safeParseJson(text: any) {
  if (!text || typeof text !== "string") return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function envInt(name: string, fallback: number) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.trunc(n);
}

function isSyncEnabled(db: any, userId: string) {
  const row = db
    .prepare("SELECT mode FROM profile_settings WHERE userId=?")
    .get(userId) as { mode?: string } | undefined;

  return row?.mode === "sync";
}

/**
 * Scores the newly created log and returns:
 * - computed score
 * - compact scoring snapshot (safe to store when sync is ON)
 */
function computeScoring(req: Request, params: { nowIso: string; mealType: MealType | null }) {
  const nowDate = new Date(params.nowIso);

  const baseCtx = buildMealContext(req, {
    now: nowDate,
    recentLimit: envInt("MEAL_CONTEXT_RECENT_LIMIT", 25),
  });

  const scoring = scoreMealContext({
    ...baseCtx,
    mealType: (params.mealType ?? baseCtx.mealType) as any, // or better: pass via opts below
  });


  // Compact snapshot: per-log explainability
  const snapshot = {
    score: scoring.score,
    reasons: Array.isArray((scoring as any).reasons) ? (scoring as any).reasons : [],
    signals: (scoring as any).signals ?? null,
    mealType: params.mealType ?? (baseCtx as any).mealType ?? null,
    nowIso: params.nowIso,
  };

  return { scoring, snapshot };
}

/**
 * GET /v1/logs?memberId=&limit=
 * memberId optional; defaults to activeMemberId.
 */
export function listLogs(req: Request, query: any) {
  const ctx = getCtx(req);
  const db = getDb(req);

  const requestedMemberId = typeof query?.memberId === "string" ? query.memberId.trim() : "";
  const subjectMemberId = requestedMemberId || ctx.activeMemberId;

  if (!ctx.allowedMemberIds.includes(subjectMemberId)) {
    throw new Error("MEMBER_NOT_ALLOWED");
  }

  const limit = parseLimit(query?.limit);

  const rows = db.prepare(
    `
    SELECT
      logId,
      actorUserId,
      subjectMemberId,
      groupId,
      placeRefId,
      mealType,
      capturedAt,
      score,
      scoringJson,
      summary,
      createdAt,
      updatedAt
    FROM logs
    WHERE subjectMemberId = ?
      AND deletedAt IS NULL
    ORDER BY capturedAt DESC
    LIMIT ?
    `
  ).all(subjectMemberId, limit);

  const items = rows.map((r: any) => ({
    logId: r.logId,
    actorUserId: r.actorUserId,
    subjectMemberId: r.subjectMemberId,
    groupId: r.groupId ?? null,
    placeRefId: r.placeRefId ?? null,
    mealType: r.mealType ?? null,
    capturedAt: r.capturedAt ?? null,
    score: r.score ?? null,
    scoring: safeParseJson(r.scoringJson),
    summary: r.summary ?? null,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }));

  return { subjectMemberId, logs: items };
}

export function createLog(req: Request, body: any) {
  const ctx = getCtx(req);
  const db = getDb(req);

  const actorUserId = ctx.userId;
  const subjectMemberId = ctx.activeMemberId;

  const groupId = assertString(body?.groupId, "groupId", 128, true);
  const placeRefId = assertString(body?.placeRefId, "placeRefId", 256, true);

  // allow either canonical mealType or "morning/midday/evening/off-hours"
  const mealType = normalizeMealType(body?.mealType);

  const summary = assertString(body?.summary, "summary", 500, true);

  // capturedAt optional; validated ISO if present; else defaults to now
  const capturedAtIso = assertIsoDate(body?.capturedAt, "capturedAt", true);

  const logId = randomUUID();
  const now = new Date().toISOString();

  const effectiveCapturedAt = capturedAtIso ?? now;

  // ✅ Score server-side only
  // const { scoring, snapshot } = computeScoring(req, { nowIso: effectiveCapturedAt, mealType });

  const syncOn = isSyncEnabled(db, actorUserId);

  // If client sends scoringJson (AI output), store it unchanged (Sync-only)
  let scoringJson: string | null = null;
  
  // This is the only "premium" path that preserves AI explainability end-to-end.
  const incomingScoring = safeParseAiScoring(body?.scoringJson);
  
  // Backward compat: allow legacy "score" only (but it won't have rich explainability)
  const incomingScore =
    typeof body?.score === "number" && Number.isFinite(body.score)
      ? Math.max(0, Math.min(100, Math.trunc(body.score)))
      : null;
  
  let finalScore: number;
  
  if (syncOn && incomingScoring) {
    // ✅ Canonical: AI is source of truth
    finalScore = Math.trunc(incomingScoring.score);
    scoringJson = stringifyAiScoring(incomingScoring);
  } else if (incomingScore != null) {
    // Legacy support: client provided score but no scoringJson
    finalScore = incomingScore;
    scoringJson = syncOn
      ? JSON.stringify({
          score: finalScore,
          label: "Ok",
          why: "Saved score without AI explanation.",
          reasons: [],
          flags: [],
          nutritionNotes: null,
          estimates: {
            calories: null,
            protein_g: null,
            carbs_g: null,
            fat_g: null,
            sugar_g: null,
            sodium_mg: null,
          },
          features: undefined,
        })
      : null;
  } else {
    // Privacy/baseline: server scores (your existing deterministic pipeline)
    const { scoring, snapshot } = computeScoring(req, { nowIso: effectiveCapturedAt, mealType });
    finalScore = scoring.score;
  
    // IMPORTANT:
    // - If you want Sync logs to ONLY store AI scoringJson, you can set this to null in sync mode.
    // - For now we keep your snapshot when AI scoringJson isn't provided.
    scoringJson = syncOn ? JSON.stringify(snapshot) : null;
  }
  

  // ✅ Ensure member exists (clear error instead of FK crash)
  const memberOk = db
    .prepare("SELECT 1 FROM members WHERE memberId = ? AND deletedAt IS NULL")
    .get(subjectMemberId);

  if (!memberOk) {
    const e: any = new Error("MEMBER_NOT_FOUND");
    e.status = 409;
    throw e;
  }


  if (placeRefId) {
    const provider = "google";
    db.prepare(`
      INSERT INTO place_refs (placeRefId, provider, providerPlaceId)
      VALUES (?, ?, ?)
      ON CONFLICT(placeRefId) DO UPDATE SET
        provider=excluded.provider,
        providerPlaceId=excluded.providerPlaceId,
        updatedAt=strftime('%Y-%m-%dT%H:%M:%fZ','now')
    `).run(placeRefId, provider, placeRefId);
  }
  

  db.prepare(
    `
    INSERT INTO logs (
      logId,
      actorUserId,
      subjectMemberId,
      groupId,
      placeRefId,
      mealType,
      capturedAt,
      score,
      scoringJson,
      summary,
      createdAt,
      updatedAt
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
  ).run(
    logId,
    actorUserId,
    subjectMemberId,
    groupId,
    placeRefId,
    mealType,
    effectiveCapturedAt,
    finalScore,
    scoringJson,
    summary,
    now,
    now
  );

  writeAuditEvent(db, {
    actorUserId,
    action: "LOG_CREATE",
    targetType: "log",
    targetId: logId,
    requestId: ctx.requestId,
    ip: req.ip,
    userAgent: req.headers["user-agent"],
    metadata: {
      mealType,
      score: finalScore,
      groupId,
      syncStored: syncOn && !!scoringJson,
    },
  });

  // Keep audit continuity since you already introduced LOG_SCORED
  writeAuditEvent(db, {
    actorUserId: ctx.userId,
    action: "LOG_SCORED",
    targetType: "log",
    targetId: logId,
    requestId: ctx.requestId,
    ip: req.ip,
    userAgent: req.headers["user-agent"],
    metadata: {
      score: finalScore,
      syncStored: syncOn && !!scoringJson,
    },
  });

  let scoringObj: any = null;
  if (scoringJson) {
    try {
      scoringObj = JSON.parse(scoringJson);
    } catch {
      scoringObj = null;
    }
  }
  



  return {
    logId,
    actorUserId,
    subjectMemberId,
    groupId,
    placeRefId,
    mealType,
    capturedAt: effectiveCapturedAt,
  score: finalScore,

  // ✅ This is what Logs UI should render (why/reasons/flags/estimates/features)
  scoring: scoringObj,

  // ✅ Optional but helpful for the frontend to persist/display verbatim
  scoringJson: scoringObj,

  summary,
  createdAt: now,
  updatedAt: now,
  };
}

export function deleteLog(req: Request, logId: string) {
  const ctx = getCtx(req);
  const db = getDb(req);

  const id = assertString(logId, "logId", 128, false)!;

  const row = db.prepare(
    `
    SELECT subjectMemberId
    FROM logs
    WHERE logId = ?
      AND deletedAt IS NULL
    `
  ).get(id) as { subjectMemberId: string } | undefined;

  if (!row) throw new Error("LOG_NOT_FOUND");

  if (!ctx.allowedMemberIds.includes(row.subjectMemberId)) {
    throw new Error("MEMBER_NOT_ALLOWED");
  }

  const now = new Date().toISOString();
  db.prepare(
    `
    UPDATE logs
    SET deletedAt = ?, updatedAt = ?
    WHERE logId = ?
    `
  ).run(now, now, id);

  writeAuditEvent(db, {
    actorUserId: ctx.userId,
    action: "LOG_DELETE",
    targetType: "log",
    targetId: id,
    requestId: ctx.requestId,
    ip: req.ip,
    userAgent: req.headers["user-agent"],
  });

  return { ok: true };
}


export function createLogServerSide(args: {
  ctx: any;
  db: any;
  summary: string | null;
  capturedAt: string;
  mealType: string | null;
  score: number;
  scoringJson: string | null;
}) {
  const { ctx, db, summary, capturedAt, mealType, score, scoringJson } = args;

  const logId = crypto.randomUUID(); // or your id helper
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO logs (
      logId, actorUserId, subjectMemberId, groupId, placeRefId,
      mealType, score, summary, capturedAt, scoringJson,
      createdAt, updatedAt
    ) VALUES (?, ?, ?, NULL, NULL, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    logId,
    ctx.userId,
    ctx.activeMemberId,
    mealType,
    score,
    summary,
    capturedAt,
    scoringJson,
    now,
    now
  );

  const row = db.prepare(`SELECT * FROM logs WHERE logId=?`).get(logId);
  return row;
}
