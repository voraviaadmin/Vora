// src/utils/scoring.ts
import { envInt } from "../config/runtime";

export type ScoreResult = {
  score: number; // 0..100
  reasons: string[];
  signals: {
    hasPreferences: boolean;
    hasRecentLogs: boolean;
    mealType: string;
    goal: string | null;
    healthFlags: { diabetes: boolean; highBP: boolean; fattyLiver: boolean } | null;
    cuisineCount: number | null;

    // Pattern signals
    lastNMealTypes: string[];
    uniqueMealTypesWindow: number;
    snackStreakN: boolean;
    lateSnackInWindow: boolean;
    skippedMealsLikely: { breakfast: boolean; lunch: boolean; dinner: boolean } | null;
    repeatMealTypeN: boolean;
  };
};

type MealType = "breakfast" | "lunch" | "dinner" | "snack";

type MealContextLike = {
  mealType: MealType;
  nowIso?: string;
  recentLogs: Array<{
    mealType: string | null;
    capturedAt?: string | null;
    createdAt?: string | null;
    score?: number | null;
  }>;
  preferences: null | {
    health: { diabetes: boolean; highBP: boolean; fattyLiver: boolean };
    goal: "lose" | "maintain" | "gain";
    cuisines: string[];
  };
  syncEnabled: boolean;
};

function clampInt(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Math.round(n)));
}

function parseIsoOrNull(s: any): Date | null {
  if (!s || typeof s !== "string") return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function normalizeMealType(raw: string | null | undefined): MealType | null {
  if (!raw) return null;
  const v = String(raw).trim().toLowerCase();

  if (v === "breakfast" || v === "lunch" || v === "dinner" || v === "snack") return v;

  // Back-compat if anything ever stores window labels:
  if (v === "morning") return "breakfast";
  if (v === "midday") return "lunch";
  if (v === "evening") return "dinner";
  if (v === "off-hours") return "snack";

  return null;
}

function getLogWhen(log: { capturedAt?: string | null; createdAt?: string | null }): Date | null {
  return parseIsoOrNull(log.capturedAt) ?? parseIsoOrNull(log.createdAt);
}

function distinctMealTypes(logs: Array<{ mealType: string | null }>): Set<MealType> {
  const s = new Set<MealType>();
  for (const l of logs) {
    const mt = normalizeMealType(l.mealType);
    if (mt) s.add(mt);
  }
  return s;
}

function lastNMealTypes(logs: Array<{ mealType: string | null }>, n: number): MealType[] {
  const out: MealType[] = [];
  for (const l of logs) {
    const mt = normalizeMealType(l.mealType);
    if (mt) out.push(mt);
    if (out.length >= n) break;
  }
  return out;
}

function filterRecentByMs(
  logs: Array<{ mealType: string | null; capturedAt?: string | null; createdAt?: string | null }>,
  now: Date,
  windowMs: number
) {
  const cutoff = now.getTime() - windowMs;
  return logs.filter((l) => {
    const d = getLogWhen(l);
    return !!d && d.getTime() >= cutoff;
  });
}

function computeSkippedMealsLikely(
  logsWindow: Array<{ mealType: string | null }>,
  now: Date,
  cutoffs: { breakfastHour: number; lunchHour: number; dinnerHour: number }
): { breakfast: boolean; lunch: boolean; dinner: boolean } {
  const set = distinctMealTypes(logsWindow);
  const hour = now.getHours();

  // Don’t mark as “skipped” until it’s reasonably late for that meal
  const breakfastRelevant = hour >= cutoffs.breakfastHour;
  const lunchRelevant = hour >= cutoffs.lunchHour;
  const dinnerRelevant = hour >= cutoffs.dinnerHour;

  return {
    breakfast: breakfastRelevant ? !set.has("breakfast") : false,
    lunch: lunchRelevant ? !set.has("lunch") : false,
    dinner: dinnerRelevant ? !set.has("dinner") : false,
  };
}

function isLateSnack(d: Date, lateStartHour: number, lateEndHour: number): boolean {
  // Handles wrap-around (e.g., 21 -> 3)
  const h = d.getHours();
  if (lateStartHour <= lateEndHour) {
    return h >= lateStartHour && h <= lateEndHour;
  }
  return h >= lateStartHour || h <= lateEndHour;
}

function getTuning() {
  // All env-driven with sane caps.
  // You can change behavior by editing .env only.

  const clamp0to100 = (n: number) => Math.max(0, Math.min(100, n));

  const base = envInt("SCORE_BASE", 70, { min: 0, max: 100 });

  const prefsBonusSync = envInt("SCORE_PREFS_BONUS_SYNC", 8, { min: 0, max: 50 });
  const prefsBonusPrivacy = envInt("SCORE_PREFS_BONUS_PRIVACY", 3, { min: 0, max: 50 });

  const hasRecentLogsBonus = envInt("SCORE_HAS_LOGS_BONUS", 2, { min: 0, max: 20 });

  const goalLosePenaltyForSnack = envInt("SCORE_GOAL_LOSE_SNACK_PENALTY", 5, { min: 0, max: 30 });
  const goalGainBonusForSnack = envInt("SCORE_GOAL_GAIN_SNACK_BONUS", 3, { min: 0, max: 30 });

  const healthCautionPenaltyEach = envInt("SCORE_HEALTH_FLAG_PENALTY_EACH", 2, { min: 0, max: 20 });

  // Pattern scoring
  const patternWindowHours = envInt("SCORE_PATTERN_WINDOW_HOURS", 24, { min: 6, max: 168 });
  const skippedWindowHours = envInt("SCORE_SKIPPED_WINDOW_HOURS", 18, { min: 6, max: 48 });

  const uniqueBonus2 = envInt("SCORE_UNIQUE_MEALS_BONUS_2", 3, { min: 0, max: 20 });
  const uniqueBonus3 = envInt("SCORE_UNIQUE_MEALS_BONUS_3", 5, { min: 0, max: 30 });

  const streakN = envInt("SCORE_STREAK_N", 3, { min: 2, max: 10 });
  const snackStreakPenalty = envInt("SCORE_SNACK_STREAK_PENALTY", 6, { min: 0, max: 40 });

  const repeatMealTypePenalty = envInt("SCORE_REPEAT_MEALTYPE_PENALTY", 2, { min: 0, max: 20 });

  const lateSnackPenalty = envInt("SCORE_LATE_SNACK_PENALTY", 4, { min: 0, max: 30 });
  const lateSnackStartHour = envInt("SCORE_LATE_SNACK_START_HOUR", 21, { min: 0, max: 23 });
  const lateSnackEndHour = envInt("SCORE_LATE_SNACK_END_HOUR", 3, { min: 0, max: 23 });

  const skippedMealPenaltyEach = envInt("SCORE_SKIPPED_MEAL_PENALTY_EACH", 3, { min: 0, max: 30 });

  // “Don’t consider skipped until…” cutoffs (local hours)
  const breakfastSkipAfterHour = envInt("SCORE_BREAKFAST_SKIP_AFTER_HOUR", 10, { min: 0, max: 23 });
  const lunchSkipAfterHour = envInt("SCORE_LUNCH_SKIP_AFTER_HOUR", 14, { min: 0, max: 23 });
  const dinnerSkipAfterHour = envInt("SCORE_DINNER_SKIP_AFTER_HOUR", 20, { min: 0, max: 23 });

  const minScore = clamp0to100(envInt("SCORE_MIN", 0, { min: 0, max: 100 }));
  const maxScore = clamp0to100(envInt("SCORE_MAX", 100, { min: 0, max: 100 }));

  return {
    base,
    prefsBonusSync,
    prefsBonusPrivacy,
    hasRecentLogsBonus,
    goalLosePenaltyForSnack,
    goalGainBonusForSnack,
    healthCautionPenaltyEach,

    patternWindowMs: patternWindowHours * 60 * 60 * 1000,
    skippedWindowMs: skippedWindowHours * 60 * 60 * 1000,

    uniqueBonus2,
    uniqueBonus3,

    streakN,
    snackStreakPenalty,
    repeatMealTypePenalty,

    lateSnackPenalty,
    lateSnackStartHour,
    lateSnackEndHour,

    skippedMealPenaltyEach,
    skipCutoffs: {
      breakfastHour: breakfastSkipAfterHour,
      lunchHour: lunchSkipAfterHour,
      dinnerHour: dinnerSkipAfterHour,
    },

    minScore,
    maxScore,
  } as const;
}

/**
 * Scoring (configurable via env):
 * - deterministic
 * - preference-aware
 * - pattern-aware
 * - still no nutrition DB, no AI
 */
export function scoreMealContext(ctx: MealContextLike): ScoreResult {
  const T = getTuning();
  const reasons: string[] = [];

  let score: number = T.base;

  const hasPrefs = !!ctx.preferences;
  const hasLogs = (ctx.recentLogs?.length ?? 0) > 0;

  if (hasPrefs) {
    score += ctx.syncEnabled ? T.prefsBonusSync : T.prefsBonusPrivacy;
    reasons.push("Preferences applied.");
  } else {
    reasons.push("No saved preferences yet.");
  }

  if (hasLogs) {
    score += T.hasRecentLogsBonus;
    reasons.push("Recent logs available for pattern context.");
  } else {
    reasons.push("No recent logs yet.");
  }

  const goal = ctx.preferences?.goal ?? null;

  if (goal === "lose" && ctx.mealType === "snack") {
    score -= T.goalLosePenaltyForSnack;
    reasons.push("Lose goal: snacks get a small penalty.");
  } else if (goal === "gain" && ctx.mealType === "snack") {
    score += T.goalGainBonusForSnack;
    reasons.push("Gain goal: snacks get a small bonus.");
  }

  const health = ctx.preferences?.health ?? null;
  if (health) {
    const flags = [health.diabetes, health.highBP, health.fattyLiver].filter(Boolean).length;
    if (flags > 0) {
      score -= flags * T.healthCautionPenaltyEach;
      reasons.push("Health constraints enabled: applying caution.");
    }
  }

  // ---- Pattern signals (configurable) ----
  const now = parseIsoOrNull(ctx.nowIso) ?? new Date();

  const logsPatternWindow = filterRecentByMs(ctx.recentLogs, now, T.patternWindowMs);
  const logsSkippedWindow = filterRecentByMs(ctx.recentLogs, now, T.skippedWindowMs);

  const lastN = lastNMealTypes(ctx.recentLogs, Math.max(1, T.streakN));
  const lastStreak = lastNMealTypes(ctx.recentLogs, T.streakN);

  const uniqueCount = distinctMealTypes(logsPatternWindow).size;

  if (uniqueCount >= 3) {
    score += T.uniqueBonus3;
    reasons.push("Recent eating pattern looks consistent (multiple meal types logged).");
  } else if (uniqueCount >= 2) {
    score += T.uniqueBonus2;
    reasons.push("Some meal variety logged recently.");
  }

  const snackStreakN = lastStreak.length === T.streakN && lastStreak.every((t) => t === "snack");
  if (snackStreakN) {
    score -= T.snackStreakPenalty;
    reasons.push(`Recent pattern: multiple snacks in a row.`);
  }

  const repeatMealTypeN = lastStreak.length === T.streakN && lastStreak.every((t) => t === lastStreak[0]);
  if (repeatMealTypeN && !snackStreakN) {
    score -= T.repeatMealTypePenalty;
    reasons.push("Recent pattern: repeating the same meal type.");
  }

  let lateSnackInWindow = false;
  for (const l of logsPatternWindow) {
    const mt = normalizeMealType(l.mealType);
    if (mt !== "snack") continue;
    const when = getLogWhen(l);
    if (when && isLateSnack(when, T.lateSnackStartHour, T.lateSnackEndHour)) {
      lateSnackInWindow = true;
      break;
    }
  }
  if (lateSnackInWindow) {
    score -= T.lateSnackPenalty;
    reasons.push("Recent pattern: late-night snacking.");
  }

  const skippedMealsLikely = hasLogs ? computeSkippedMealsLikely(logsSkippedWindow, now, T.skipCutoffs) : null;
  if (skippedMealsLikely) {
    const misses = Object.entries(skippedMealsLikely).filter(([, v]) => v).map(([k]) => k);
    if (misses.length > 0) {
      score -= misses.length * T.skippedMealPenaltyEach;
      reasons.push(`Recent pattern: missing ${misses.join(" & ")} logs.`);
    }
  }

  score = clampInt(score, T.minScore, T.maxScore);

  return {
    score,
    reasons,
    signals: {
      hasPreferences: hasPrefs,
      hasRecentLogs: hasLogs,
      mealType: ctx.mealType,
      goal,
      healthFlags: health,
      cuisineCount: ctx.preferences ? (ctx.preferences.cuisines?.length ?? 0) : null,

      lastNMealTypes: lastN,
      uniqueMealTypesWindow: uniqueCount,
      snackStreakN,
      lateSnackInWindow,
      skippedMealsLikely,
      repeatMealTypeN,
    },
  };
}
