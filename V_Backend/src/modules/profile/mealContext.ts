import type { Request } from "express";
import { decryptProfile } from "./crypto";
import { getMealType } from "../../utils/mealTime";
import { computeTrendFromLogs, fetchTrendLogs } from "../../utils/trends";
import { envInt } from "../../config/runtime";
import type { MealType } from "../../utils/mealTime";


export type MealTypeHint = "breakfast" | "lunch" | "dinner" | "snack";

export type MealItem = {
  name: string;
  quantityText?: string | null;
  notes?: string | null;
};

export type MealInput = {
  capturedAt: string; // ISO
  mealTypeHint?: MealTypeHint | null;
  items?: MealItem[] | null;
  itemsText?: string | null;
  imageRefs?: string[] | null;
  source: "log" | "food_scan" | "menu_scan" | "suggestion";
  sourceMeta?: Record<string, any> | null;
};


export type ProfilePreferences = {
  health: { diabetes: boolean; highBP: boolean; fattyLiver: boolean };
  goal: "lose" | "maintain" | "gain";
  cuisines: string[];
};

export type MealContext = {
  activeMemberId: string;
  nowIso: string;
  mealType: "breakfast" | "lunch" | "dinner" | "snack";
  mealInput?: MealInput | null;


  recentLogs: {
    logId: string;
    actorUserId: string;
    subjectMemberId: string;
    groupId: string | null;
    placeRefId: string | null;
    mealType: string | null;
    score: number | null;
    summary: string | null;
    capturedAt: string | null;
    createdAt: string;
    updatedAt: string;
  }[];

  preferences: ProfilePreferences | null;
  syncEnabled: boolean;

  trend: ReturnType<typeof computeTrendFromLogs>;
};

function getCtx(req: Request) {
  const anyReq = req as any;
  const ctx = anyReq.ctx ?? anyReq.context ?? anyReq.locals?.ctx;
  if (!ctx) throw new Error("CTX_MISSING");
  return ctx as {
    userId: string;
    activeMemberId: string;
    allowedMemberIds: string[];
    requestId: string;
  };
}

function getDb(req: Request) {
  const anyReq = req as any;
  const db = anyReq.app?.locals?.db;
  if (!db) throw new Error("DB_MISSING");
  return db;
}

export function buildMealContext(
  req: Request,
  opts: { trendDays?: number; recentLimit?: number; goodScoreThreshold?: number; now?: Date },
  overrides?: { nowIso?: string; mealTypeHint?: MealTypeHint | null; mealInput?: MealInput | null }
): MealContext {
  const ctx = getCtx(req);
  const db = getDb(req);

  if (!ctx?.activeMemberId) throw new Error("ACTIVE_MEMBER_REQUIRED");
  if (!ctx.allowedMemberIds?.includes(ctx.activeMemberId)) throw new Error("MEMBER_NOT_ALLOWED");

  const now = opts?.now ?? new Date();
  const nowIso = overrides?.nowIso ?? new Date().toISOString();

  const mealType =
  overrides?.mealTypeHint ??
  getMealType(new Date(nowIso)); // or your existing getMealType call


  // ---- Configurable limits (env defaults, per-call overrides) ----
  const recentDefault = envInt("MEALCONTEXT_RECENT_LOGS_DEFAULT", 25, { min: 0, max: 200 });
  const recentMax = envInt("MEALCONTEXT_RECENT_LOGS_MAX", 200, { min: 10, max: 500 });
  const recentLimit = Math.min(recentMax, Math.max(0, opts?.recentLimit ?? recentDefault));

  const trendDefaultDays = envInt("TRENDS_DEFAULT_DAYS", 7, { min: 1, max: 60 });
  const trendMaxDays = envInt("TRENDS_MAX_DAYS", 60, { min: 7, max: 180 });
  const trendDays = Math.min(trendMaxDays, Math.max(1, opts?.trendDays ?? trendDefaultDays));

  const goodScoreThreshold =
    opts?.goodScoreThreshold ?? envInt("TRENDS_GOOD_SCORE_THRESHOLD", 70, { min: 0, max: 100 });

  // ---- Sync mode / preferences ----
  const settings = db.prepare("SELECT mode FROM profile_settings WHERE userId=?").get(ctx.userId) as
    | { mode?: string }
    | undefined;

  const syncEnabled = settings?.mode === "sync";

  let preferences: ProfilePreferences | null = null;
  if (syncEnabled) {
    const row = db
      .prepare("SELECT encryptedJson FROM user_profile_preferences_secure WHERE userId=?")
      .get(ctx.userId) as { encryptedJson: string } | undefined;

    preferences = row ? (decryptProfile(row.encryptedJson) as ProfilePreferences) : null;
  }

  // ---- Recent logs (schema-correct) ----
  const recentLogs = db
    .prepare(
      `
      SELECT
        logId,
        actorUserId,
        subjectMemberId,
        groupId,
        placeRefId,
        mealType,
        score,
        summary,
        capturedAt,
        createdAt,
        updatedAt
      FROM logs
      WHERE actorUserId = ?
        AND subjectMemberId = ?
        AND deletedAt IS NULL
      ORDER BY COALESCE(capturedAt, createdAt) DESC
      LIMIT ?
      `
    )
    .all(ctx.userId, ctx.activeMemberId, recentLimit);

  // ---- Trend logs (dynamic window) ----
  const trendRows = fetchTrendLogs(db, {
    actorUserId: ctx.userId,
    subjectMemberId: ctx.activeMemberId,
    windowDays: trendDays,
  });

  const trend = computeTrendFromLogs(trendRows, now, { windowDays: trendDays, goodScoreThreshold });

  return {
    activeMemberId: ctx.activeMemberId,
    nowIso,
    mealType,
    recentLogs,
    preferences,
    syncEnabled,
    trend,
    mealInput: overrides?.mealInput ?? null,
  };
}
