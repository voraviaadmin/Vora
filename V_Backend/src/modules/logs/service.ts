import type { Request } from "express";
import { randomUUID } from "crypto";
import { writeAuditEvent } from "../../audit/audit";
import { buildMealContext } from "../profile/mealContext";
import { scoreMealContext } from "../../utils/scoring";

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
  const { scoring, snapshot } = computeScoring(req, { nowIso: effectiveCapturedAt, mealType });

  // ✅ If client already has AI score, persist it
  const incomingScore =
    typeof body?.score === "number" && Number.isFinite(body.score)
      ? Math.max(0, Math.min(100, Math.trunc(body.score)))
      : null;

  const syncOn = isSyncEnabled(db, actorUserId);

  let finalScore: number;
  let scoringJson: string | null = null;

  if (incomingScore != null) {
    finalScore = incomingScore;
    if (syncOn) {
      scoringJson = JSON.stringify({
        score: finalScore,
        mealType: mealType ?? null,
        nowIso: effectiveCapturedAt,
        source: "client",
      });
    }
  } else {
    const { scoring, snapshot } = computeScoring(req, { nowIso: effectiveCapturedAt, mealType });
    finalScore = scoring.score;
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
    scoring.score,
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
      score: scoring.score,
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
      score: scoring.score,
      syncStored: syncOn && !!scoringJson,
    },
  });

  return {
    logId,
    actorUserId,
    subjectMemberId,
    groupId,
    placeRefId,
    mealType,
    capturedAt: effectiveCapturedAt,
    score: scoring.score,
    scoring: syncOn ? snapshot : null, // return snapshot immediately if stored
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
