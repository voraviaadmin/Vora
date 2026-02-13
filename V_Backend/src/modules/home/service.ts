import type { Request } from "express";
import { getCtx, getDb } from "../logs/service";
import {
  buildProfileSummary,
  buildDailyVector2,
  getBestNextMealV2,
  type Behavior14Day,
} from "../../intelligence/engine";
import { computeTodayTotals, compute14DayBehavior } from "../logs/service";
// If your crypto export name differs, change this import accordingly.
import { decryptProfile } from "../profile/crypto";


function readUserPrefsSyncOnly(db: any, userId: string): any | null {
  const row = db
    .prepare(`SELECT encryptedJson FROM user_profile_preferences_secure WHERE userId=?`)
    .get(userId) as { encryptedJson?: string } | undefined;

  if (!row?.encryptedJson) return null;

  try {
    // decryptProfile should return the plain prefs object
    const prefs = decryptProfile(row.encryptedJson);
    return prefs && typeof prefs === "object" ? prefs : null;
  } catch {
    return null;
  }
}



type HomeWindow = "daily" | "3d" | "7d" | "14d";

function windowLabel(window: HomeWindow) {
  if (window === "daily") return "Daily Score";
  if (window === "3d") return "3-day Avg";
  if (window === "7d") return "7-day Avg";
  return "14-day Avg";
}

function clampScore(n: any): number | null {
  const v = Number(n);
  if (!Number.isFinite(v)) return null;
  const i = Math.round(v);
  if (i < 0) return 0;
  if (i > 100) return 100;
  return i;
}

function daysForWindow(window: HomeWindow) {
  if (window === "daily") return 1;
  if (window === "3d") return 3;
  if (window === "7d") return 7;
  return 14;
}

// Server-local day boundary for v1 (later: member timezone)
function startOfLocalDayIso(now: Date) {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function isSyncEnabled(db: any, userId: string) {
  const row = db
    .prepare("SELECT mode FROM profile_settings WHERE userId=?")
    .get(userId) as { mode?: string } | undefined;

  return row?.mode === "sync";
}

function statusForScore(score: number, hasData: boolean) {
  if (!hasData) {
    return {
      statusWord: "Start",
      description: "Log a meal to build your daily score.",
    };
  }

  if (score >= 80) return { statusWord: "Excellent", description: "Keep it steady. Small choices add up." };
  if (score >= 65) return { statusWord: "Good", description: "A couple smart choices will help." };
  if (score >= 50) return { statusWord: "Okay", description: "You’re close. One balanced meal can lift today." };
  return { statusWord: "Steady", description: "A protein + fiber combo can help next." };
}

function safeJsonParse(v: any): any | null {
  if (!v) return null;
  if (typeof v === "object") return v;
  if (typeof v === "string") {
    try { return JSON.parse(v); } catch { return null; }
  }
  return null;
}

function getEstimatesFromRow(r: any): any | null {
  const sj = safeJsonParse(r?.scoringJson);
  const e = sj?.estimates;
  return e && typeof e === "object" ? e : null;
}

function hasAnyNumericEstimate(e: any): boolean {
  if (!e) return false;
  const keys = ["calories","protein_g","carbs_g","fat_g","sugar_g","sodium_mg","fiber_g"];
  return keys.some(k => Number.isFinite(Number(e[k])));
}

type DishIdea = {
  title: string;
  query: string;
  cuisineHint?: string | null;
  tags?: string[];
};

function clampStr(s: any, max: number) {
  const v = typeof s === "string" ? s.trim() : "";
  return v.length > max ? v.slice(0, max) : v;
}

function sanitizeIdeas(raw: any): { ideas: DishIdea[]; searchKey: string } | null {
  const ideasRaw = raw?.ideas;
  const searchKeyRaw = raw?.searchKey;

  if (!Array.isArray(ideasRaw)) return null;

  const ideas: DishIdea[] = ideasRaw
    .slice(0, 3)
    .map((x: any) => ({
      title: clampStr(x?.title, 60),
      query: clampStr(x?.query, 80) || clampStr(x?.title, 80),
      cuisineHint: x?.cuisineHint ? clampStr(x.cuisineHint, 30) : null,
      tags: Array.isArray(x?.tags) ? x.tags.slice(0, 2).map((t: any) => clampStr(t, 18)).filter(Boolean) : [],
    }))
    .filter((i) => i.title && i.query);

  const searchKey = clampStr(searchKeyRaw, 80);

  if (ideas.length !== 3) return null;

  return { ideas, searchKey: searchKey || ideas[0].query };
}

async function generateDishIdeasAI(input: {
  apiKey: string;
  model: string;
  timeWindow: string;
  bullets: string[];
  cuisineHint?: string | null;
  recentSummaries: string[];
  modeLabel: "sync";
  aiPersonality?: "straight" | "encouraging" | "coach"; // ✅ NEW
}): Promise<{ ideas: DishIdea[]; searchKey: string } | null> {
  // non-medical, concise JSON output

  const tone =
  input.aiPersonality === "straight"
    ? "Write in a direct, no-fluff tone. Keep it short."
    : input.aiPersonality === "encouraging"
    ? "Write in a warm, encouraging tone. Be positive and motivating."
    : input.aiPersonality === "coach"
    ? "Write in a coach-like tone with 2–3 action steps."
    : "Write in a warm, encouraging tone. Keep it concise.";



  const prompt = {
    timeWindow: input.timeWindow,
    guidanceBullets: input.bullets,
    cuisineHint: input.cuisineHint ?? null,
    recentLogs: input.recentSummaries.slice(0, 10),
    tone, // ✅ NEW (the model will follow this)
    constraints: {
      count: 3,
      style: "premium, simple, non-medical, no numbers, restaurant-search friendly",
      output: "JSON only",
    },
  };

  const controller = new AbortController();
const t = setTimeout(() => controller.abort(), 1400); // 1.4s hard stop (tune)


try {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${input.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: input.model,
      temperature: 0.6,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You generate 3 personalized dish ideas for a nutrition app. " +
            "Be non-medical, concise, and restaurant-search friendly. " +
            "Output MUST be valid JSON with keys: { searchKey: string, ideas: [{title, query, cuisineHint?, tags?}] }. " +
            "No extra keys, no commentary.",
        },
        {
          role: "user",
          content: JSON.stringify(prompt),
        },
      ],
    }),
  }
);

  if (!res.ok) return null;

  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content;
  const parsed = safeJsonParse(text);
  return sanitizeIdeas(parsed);
} catch (e) {
  return null; // NEVER block Home
} finally {
  clearTimeout(t);
}
}

type TodayTotals = {
  calories: number;
  protein_g: number;
  sugar_g: number;
  sodium_mg: number;
  fiber_g: number;
};

function computeTodayTotalsFromRows(rows: any[]): TodayTotals {
  // NOTE: implement using r.summary if it contains nutrients; otherwise return zeros safely
  const totals: TodayTotals = { calories: 0, protein_g: 0, sugar_g: 0, sodium_mg: 0, fiber_g: 0 };

  for (const r of rows) {
    const s = safeParseSummary(r.summary);
    if (!s) continue;

    // if summary stores these keys
    totals.calories += num(s.calories);
    totals.protein_g += num(s.protein_g ?? s.protein);
    totals.sugar_g += num(s.sugar_g ?? s.sugar);
    totals.sodium_mg += num(s.sodium_mg ?? s.sodium);
    totals.fiber_g += num(s.fiber_g ?? s.fiber);
  }

  return totals;
}

function computeBehavior14dFromRows(rows: any[], targets?: { sodium_mg_max?: number; protein_g?: number }): Behavior14Day {
  // Minimal safe defaults; you can refine once nutrients schema is confirmed
  const days = new Map<string, { sodium: number; protein: number; calories: number; sugar: number; fiber: number; cuisines: Record<string, number> }>();

  for (const r of rows) {
    const dayKey = (r.capturedAt ?? "").slice(0, 10); // YYYY-MM-DD
    if (!dayKey) continue;

    const s = safeParseSummary(r.summary);
    if (!s) continue;

    const entry = days.get(dayKey) ?? { sodium: 0, protein: 0, calories: 0, sugar: 0, fiber: 0, cuisines: {} };

    entry.calories += num(s.calories);
    entry.protein += num(s.protein_g ?? s.protein);
    entry.sodium += num(s.sodium_mg ?? s.sodium);
    entry.sugar += num(s.sugar_g ?? s.sugar);
    entry.fiber += num(s.fiber_g ?? s.fiber);

    const cuisine = typeof s.cuisine === "string" ? s.cuisine.trim() : "";
    if (cuisine) entry.cuisines[cuisine] = (entry.cuisines[cuisine] ?? 0) + 1;

    days.set(dayKey, entry);
  }

  const dayEntries = Array.from(days.values());
  const n = Math.max(1, dayEntries.length);

  const avgCalories = Math.round(dayEntries.reduce((a, d) => a + d.calories, 0) / n);
  const avgProtein_g = Math.round(dayEntries.reduce((a, d) => a + d.protein, 0) / n);
  const avgSodium_mg = Math.round(dayEntries.reduce((a, d) => a + d.sodium, 0) / n);
  const avgSugar_g = Math.round(dayEntries.reduce((a, d) => a + d.sugar, 0) / n);
  const avgFiber_g = Math.round(dayEntries.reduce((a, d) => a + d.fiber, 0) / n);

  const sodiumMax = targets?.sodium_mg_max ?? 2300;
  const proteinTarget = targets?.protein_g ?? 110;

  const highSodiumDays = dayEntries.filter((d) => d.sodium >= sodiumMax).length;
  const lowProteinDays = dayEntries.filter((d) => d.protein <= Math.max(0, proteinTarget * 0.8)).length;

  // Common cuisine (simple most-frequent)
  const cuisineCounts: Record<string, number> = {};
  for (const d of dayEntries) {
    for (const [c, cnt] of Object.entries(d.cuisines)) cuisineCounts[c] = (cuisineCounts[c] ?? 0) + cnt;
  }
  const commonCuisine =
    Object.entries(cuisineCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  return {
    avgCalories,
    avgProtein_g,
    avgSodium_mg,
    avgSugar_g,
    avgFiber_g,
    highSodiumDaysPct: n ? highSodiumDays / n : 0,
    lowProteinDaysPct: n ? lowProteinDays / n : 0,
    commonCuisine,
  };
}

function safeParseSummary(summary: any): any | null {
  if (!summary) return null;
  if (typeof summary === "object") return summary;
  if (typeof summary === "string") {
    try {
      return JSON.parse(summary);
    } catch {
      return null;
    }
  }
  return null;
}

function num(v: any): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}


function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("TIMEOUT")), ms);
    p.then((v) => { clearTimeout(t); resolve(v); })
     .catch((e) => { clearTimeout(t); reject(e); });
  });
}

function clamp01(n: any) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}


// IMPORTANT: request-scoped single-call guard (backend safety)
function getHomeAiGuard(req: Request) {
  const anyReq = req as any;
  if (typeof anyReq.__homeAiUsed !== "boolean") anyReq.__homeAiUsed = false;
  return {
    used: () => Boolean(anyReq.__homeAiUsed),
    mark: () => { anyReq.__homeAiUsed = true; }
  };
}

export async function getHomeSummary(
  req: Request,
  opts: { window: HomeWindow; limit: number }
) {
  const ctx = getCtx(req);
  const db = getDb(req);

  const subjectMemberId = ctx.activeMemberId;
  if (!ctx.allowedMemberIds.includes(subjectMemberId)) {
    throw new Error("MEMBER_NOT_ALLOWED");
  }

  const anyReq = req as any;
  anyReq.__homeAiUsed = anyReq.__homeAiUsed ?? false;
  



  // ---- Mode (compute once)
  const syncOn = isSyncEnabled(db, ctx.userId);
  const syncMode = syncOn ? "sync" : "privacy";

  const userPrefs = syncOn ? readUserPrefsSyncOnly(db, ctx.userId) : null;
  const localIntelOrNull = null; // keep local-only for now (frontend supplies later)


  // ---- Window query (your existing logic)
  const now = new Date();
  const toIso = now.toISOString();

  const fromIso =
    opts.window === "daily"
      ? startOfLocalDayIso(now)
      : new Date(now.getTime() - daysForWindow(opts.window) * 24 * 60 * 60 * 1000).toISOString();

  const rows = db
    .prepare(
      `
      SELECT logId, mealType, capturedAt, score, summary, scoringJson
      FROM logs
      WHERE subjectMemberId = ?
        AND deletedAt IS NULL
        AND capturedAt >= ?
        AND capturedAt <= ?
      ORDER BY capturedAt DESC
      LIMIT 200
      `
    )
    .all(subjectMemberId, fromIso, toIso);

  // ---- Normalize + compute hero score (NO intelligence in here)
  const scores: number[] = [];
  const normalized = rows.map((r: any) => {
    const s = clampScore(r.score);
    if (s != null) scores.push(s);

    return {
      logId: r.logId,
      capturedAt: r.capturedAt ?? null,
      mealType: r.mealType ?? null,
      summary: r.summary ?? null,
      score: s,
    };
  });

  const hasData = scores.length > 0;
  const avgScore = hasData ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
  const status = statusForScore(avgScore, hasData);

  // ---- 14d behavior query (ALWAYS 14d; run ONCE)
  const fromIso14d = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString();

  const rows14d = db
    .prepare(
      `
      SELECT capturedAt, summary, scoringJson
      FROM logs
      WHERE subjectMemberId = ?
        AND deletedAt IS NULL
        AND capturedAt >= ?
        AND capturedAt <= ?
      ORDER BY capturedAt DESC
      LIMIT 800
      `
    )
    .all(subjectMemberId, fromIso14d, toIso);

  const behavior14d = compute14DayBehavior(rows14d); // <-- from 14d rows ONLY


  

  // ---- Daily-only intelligence
  const profileSummary = buildProfileSummary({
    mode: syncMode,
    preferences: syncOn ? userPrefs : null,
    intel: localIntelOrNull,

  });

  const todayTotals = opts.window === "daily" ? computeTodayTotals(rows) : null;

  const vector =
    opts.window === "daily" && todayTotals
      ? buildDailyVector2({
          profile: profileSummary,
          consumed: todayTotals,
          behavior14d,
        })
      : null;

  const bestNextMeal =
    opts.window === "daily" && vector
      ? getBestNextMealV2({
          profile: profileSummary,
          vector,
          behavior14d,
        })
      : null;


  // ---- AI dish ideas (Sync-only, daily-only, never blocks Home)
  let dishIdeas: DishIdea[] | null = null;
  let restaurantSearchKey: string | null = null;

  if (opts.window === "daily" && syncOn && bestNextMeal) {
    const guard = getHomeAiGuard(req);

    // 1 call max per request (even if refactors call twice)
    if (!guard.used()) {
      guard.mark();

      const apiKey = process.env.OPENAI_API_KEY || "";
      const model = process.env.OPENAI_MODEL_HOME_IDEAS || "gpt-4o-mini";

      // If no key, skip silently (Home must never break)
      if (apiKey) {
        const timeWindow = "next meal";
        const bullets = Array.isArray((bestNextMeal as any)?.meta?.bullets)
          ? (bestNextMeal as any).meta.bullets.slice(0, 6)
          : [];

        // Light personalization from last logs
        const recentSummaries = rows
          .map((r: any) => (typeof r?.summary === "string" ? r.summary : ""))
          .filter(Boolean)
          .slice(0, 8);

        try {
          const aiRaw = await withTimeout(
            generateDishIdeasAI({
              apiKey,
              model,
              timeWindow,
              bullets,
              cuisineHint: behavior14d?.commonCuisine ?? null,
              recentSummaries,
              modeLabel: "sync",
              aiPersonality: userPrefs?.aiPersonality ?? "straight",
            }),
            1600 // hard cap: tune to taste
          );

          const sanitized = sanitizeIdeas(aiRaw);
          if (sanitized) {
            dishIdeas = sanitized.ideas;
            restaurantSearchKey = sanitized.searchKey;
          }
        } catch {
          // swallow: Home must never block
        }
      }
    }
  }

      
      // fallback (still premium) if AI fails
      if (opts.window === "daily" && !dishIdeas && bestNextMeal) {
        dishIdeas = [
          { title: "Grilled chicken bowl", query: "grilled chicken bowl", tags: ["Build"] },
          { title: "Greek salad + chicken", query: "greek chicken chicken salad", tags: ["Build"] },
          { title: "Salmon + veggies", query: "salmon vegetables", tags: ["Great"] },
        ];
        restaurantSearchKey = dishIdeas[0].query;
      }
      







  // ---- Home payload fields
  let todaysFocus: any = null;
  let suggestion: any = null;

  if (opts.window === "daily" && vector && todayTotals) {
    todaysFocus = {
      title: "Today’s Focus",
      chips: [
        { key: "deficit", label: "Deficit", valueText: vector.deficitOfDay?.text ?? "—" },
        { key: "risk", label: "Risk", valueText: vector.overRisk?.text ?? "—" },
      ],
      totals: todayTotals,
    };



    const countedRowsToday =
    opts.window === "daily"
      ? rows.filter((r: any) => hasAnyNumericEstimate(getEstimatesFromRow(r))).length
      : 0;

  const totalRowsToday = opts.window === "daily" ? rows.length : 0;

  const estimateCoverage =
    totalRowsToday > 0 ? countedRowsToday / totalRowsToday : 0;

  const behaviorConfidence = behavior14d ? 1 : 0;
  const suggestionConfidence = clamp01(0.55 * estimateCoverage + 0.45 * behaviorConfidence);


  const confidenceLabel =
  suggestionConfidence >= 0.75 ? "high" : suggestionConfidence >= 0.45 ? "medium" : "low";

suggestion = bestNextMeal
  ? {
      title: bestNextMeal.title,
      suggestionText: bestNextMeal.suggestionText,
      contextNote: bestNextMeal.contextNote ?? null,

      confidence: suggestionConfidence,       // 0..1
      confidenceLabel,                        // "low" | "medium" | "high"
      dishIdeas: dishIdeas ?? [],

      route: {
        tab: "eat-out",                        // IMPORTANT: match frontend
        searchKey: restaurantSearchKey ?? "",
      },
    }
  : null;
  }

  return {
    meta: {
      window: opts.window,
      generatedAt: new Date().toISOString(),
      syncMode,
      mode: "individual",
      subjectMemberId,
    },
    header: {
      title: "Voravia",
      subtitle: null,
      modeLabel: syncOn ? "Today • Sync" : "Today • Private",
      streakDays: 0,
    },
    heroScore: {
      value: avgScore,
      label: windowLabel(opts.window),
      resetsText: "Resets nightly",
      statusWord: status.statusWord,
      description: status.description,
      confidence: null,
    },
    actions: {
      primaryCta: { id: "scan_food", title: "Scan Food", subtitle: null },
      secondaryCta: { id: "find_restaurant", title: "Find Restaurant", subtitle: null },
    },

    // ✅ return the object (premium UI)
    todaysFocus,

    // ✅ only present for daily
    todayTotals,

    suggestion,
    recentLogs: {
      items: normalized.slice(0, opts.limit),
    },
  };
}

