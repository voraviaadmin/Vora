import type { Request } from "express";
import { getCtx, getDb } from "../logs/service";
import {
  buildProfileSummary,
  buildDailyVector2,
  getBestNextMealV2,
} from "../../intelligence/engine";
import { computeTodayTotals, compute14DayBehavior } from "../logs/service";
import { decryptProfile } from "../profile/crypto";
import { buildMacroGapExecutionPlan } from "../../intelligence/macro-gap";
import type { BestNextMealIntent as MacroIntent, ExecutionPlan as MacroPlan } from "../../intelligence/macro-gap";


/**
 * Option C (Hybrid deterministic + AI refinement) — small TTL
 * - Deterministic options always produced (cheap + stable).
 * - AI refinement is Sync-only and never blocks Home.
 * - Intent object is forward-compatible with QR/Humanoid.
 */

/* -------------------------------- Types --------------------------------- */

type HomeWindow = "daily" | "3d" | "7d" | "14d";

export type DishOption = {
  id: string;
  title: string;

  // Phase 1: keep it to searchKey (restaurant search primary)
  mode: "eatout" | "home";
  searchKey?: string | null;

  tags?: string[]; // small pills, max 2
  why?: string | null;

  // lightweight confidence (0..1) for UI pill if you want
  confidence?: number | null;
};

export type ExecutionPlan = {
  version: 1;
  primaryOptionId: string;
  steps: Array<
    | { type: "eatout_search"; searchKey: string }
    | { type: "cook"; dishName: string; notes?: string | null }
  >;

  // reserved for QR/humanoid sharing without ecosystem lock-in
  disclosure?: {
    shareMode: "none" | "qr_reserved";
    shareToken?: string | null; // future
    expiresAt?: string | null;
  };
};

export type BestNextMealIntent = {
  version: 1;
  id: string;
  ttlSec: number;
  generatedAt: string;

  context: {
    syncMode: "privacy" | "sync";
    window: HomeWindow;
    subjectMemberId: string;
  };

  today: {
    focus?: {
      deficitText?: string | null; // from vector
      riskText?: string | null; // from vector
    } | null;

    totals?: {
      calories: number;
      protein_g: number;
      sugar_g: number;
      sodium_mg: number;
      fiber_g: number;
    } | null;
  };

  behavior14d?: {
    commonCuisine?: string | null;
    // keep open for future signals without breaking clients
    [k: string]: any;
  } | null;

  options: DishOption[];

  // On-demand (future): server can return ONLY this object
  // if user taps “Best Next Meal”.
  executionPlan?: ExecutionPlan | null;
};

/* ------------------------------ Helpers ---------------------------------- */

function readUserPrefsSyncOnly(db: any, userId: string): any | null {
  const row = db
    .prepare(`SELECT encryptedJson FROM user_profile_preferences_secure WHERE userId=?`)
    .get(userId) as { encryptedJson?: string } | undefined;

  if (!row?.encryptedJson) return null;
  try {
    const prefs = decryptProfile(row.encryptedJson);
    return prefs && typeof prefs === "object" ? prefs : null;
  } catch {
    return null;
  }
}

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
    return { statusWord: "Start", description: "Log a meal to build your daily score." };
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
    try {
      return JSON.parse(v);
    } catch {
      return null;
    }
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
  const keys = ["calories", "protein_g", "carbs_g", "fat_g", "sugar_g", "sodium_mg", "fiber_g"];
  return keys.some((k) => Number.isFinite(Number(e[k])));
}

function clampStr(s: any, max: number) {
  const v = typeof s === "string" ? s.trim() : "";
  return v.length > max ? v.slice(0, max) : v;
}

function clamp01(n: any) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("TIMEOUT")), ms);
    p.then((v) => {
      clearTimeout(t);
      resolve(v);
    }).catch((e) => {
      clearTimeout(t);
      reject(e);
    });
  });
}

// IMPORTANT: request-scoped single-call guard (backend safety)
function getHomeAiGuard(req: Request) {
  const anyReq = req as any;
  if (typeof anyReq.__homeAiUsed !== "boolean") anyReq.__homeAiUsed = false;
  return {
    used: () => Boolean(anyReq.__homeAiUsed),
    mark: () => {
      anyReq.__homeAiUsed = true;
    },
  };
}

function makeIntentId(ctx: { userId: string; memberId: string }, now: Date) {
  const day = now.toISOString().slice(0, 10); // YYYY-MM-DD
  return `bni_${ctx.userId}_${ctx.memberId}_${day}`;
}


function applyAiIdeasToEatoutOnly(options: DishOption[], aiIdeas: DishIdea[]): DishOption[] {
  const next = [...options];
  let j = 0;
  for (let i = 0; i < next.length && j < aiIdeas.length; i++) {
    if (next[i].mode !== "eatout") continue;
    next[i] = {
      ...next[i],
      title: aiIdeas[j]?.title || next[i].title,
      searchKey: aiIdeas[j]?.query || next[i].searchKey,
      tags: Array.isArray(aiIdeas[j]?.tags) && aiIdeas[j]!.tags!.length
        ? aiIdeas[j]!.tags!.slice(0, 2)
        : next[i].tags,
    };
    j++;
  }
  return next;
}


function riskRank(r: any): number {
  if (r === "high") return 3;
  if (r === "medium") return 2;
  return 1; // low
}

function pickTopWatchout(summary: any): { label: string; valueText: string } | null {
  if (!summary) return null;

  const sugar = summary.sugarRisk;
  const sodium = summary.sodiumRisk;

  const sugarRank = riskRank(sugar);
  const sodiumRank = riskRank(sodium);

  // Only show if medium/high
  const bestRank = Math.max(sugarRank, sodiumRank);
  if (bestRank < 2) return null;

  // Tie-breaker: prefer sodium (more “control” narrative)
  if (sodiumRank === bestRank) return { label: "Watchout", valueText: `Sodium ${sodium}` };
  return { label: "Watchout", valueText: `Sugar ${sugar}` };
}



// --- Tiny TTL cache (server process local, small TTL, safe for v1)
type CacheEntry<T> = { expiresAt: number; value: T };
const homePlanCache = new Map<string, CacheEntry<any>>();

function cacheGet<T>(key: string): T | null {
  const hit = homePlanCache.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) {
    homePlanCache.delete(key);
    return null;
  }
  return hit.value as T;
}

function cacheSet<T>(key: string, ttlMs: number, value: T) {
  homePlanCache.set(key, { expiresAt: Date.now() + ttlMs, value });
}


type MacroPlanBundle = {
  intent: MacroIntent;
  plan: MacroPlan;
  vector: any; // you can tighten later to DailyVector2 if exported cleanly
  options: any[]; // we map to your local DishOption anyway
};


function patchPlanSearchKeyFromRefined(plan: any | null, refinedOptions: DishOption[]) {
  if (!plan || !refinedOptions?.length) return plan;

  const firstEatout = refinedOptions.find(o => o.mode === "eatout");
  const eatoutKey = firstEatout?.searchKey || firstEatout?.title;
  if (!eatoutKey) return plan;

  if (plan?.actions?.goEatOut && typeof plan.actions.goEatOut.searchKey === "string") {
    return {
      ...plan,
      actions: {
        ...plan.actions,
        goEatOut: { searchKey: eatoutKey },
      },
    };
  }
  return plan;
}



function prefsFingerprint(prefs: any): string {
  try {
    const cuisines = Array.isArray(prefs?.cuisines) ? prefs.cuisines.map(String).sort() : [];
    const goal = prefs?.goal ? String(prefs.goal) : "";
    const health = prefs?.health ? JSON.stringify(prefs.health) : "";
    const aiTone = prefs?.aiPersonality ? String(prefs.aiPersonality) : "";
    return `${cuisines.join(",")}|${goal}|${aiTone}|${health}`.slice(0, 200);
  } catch {
    return "";
  }
}




/* ------------------- Option C: Deterministic + AI refine ------------------ */

type DishIdea = { title: string; query: string; tags?: string[] };

function sanitizeIdeas(raw: any): { ideas: DishIdea[]; searchKey: string } | null {
  const ideasRaw = raw?.ideas;
  const searchKeyRaw = raw?.searchKey;
  if (!Array.isArray(ideasRaw)) return null;

  const ideas: DishIdea[] = ideasRaw
    .slice(0, 3)
    .map((x: any) => ({
      title: clampStr(x?.title, 60),
      query: clampStr(x?.query, 80) || clampStr(x?.title, 80),
      tags: Array.isArray(x?.tags)
        ? x.tags.slice(0, 2).map((t: any) => clampStr(t, 18)).filter(Boolean)
        : [],
    }))
    .filter((i) => i.title && i.query);

  const searchKey = clampStr(searchKeyRaw, 80);
  if (ideas.length < 2) return null;

  return { ideas, searchKey: searchKey || ideas[0].query };
}

async function generateDishIdeasAI(input: {
  apiKey: string;
  model: string;
  bullets: string[];
  cuisineHint?: string | null;
  recentSummaries: string[];
  aiPersonality?: "straight" | "encouraging" | "coach";
}): Promise<{ ideas: DishIdea[]; searchKey: string } | null> {
  const tone =
    input.aiPersonality === "straight"
      ? "Write in a direct, no-fluff tone. Keep it short."
      : input.aiPersonality === "encouraging"
        ? "Write in a warm, encouraging tone. Be positive and motivating."
        : input.aiPersonality === "coach"
          ? "Write in a coach-like tone with 2–3 action steps."
          : "Write in a warm, encouraging tone. Keep it concise.";

  const prompt = {
    timeWindow: "next meal",
    guidanceBullets: input.bullets.slice(0, 6),
    cuisineHint: input.cuisineHint ?? null,
    recentLogs: input.recentSummaries.slice(0, 10),
    tone,
    constraints: {
      count: 3,
      style: "premium, simple, non-medical, restaurant-search friendly",
      output: "JSON only",
    },
  };

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 1400);

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
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
              "Output MUST be valid JSON with keys: { searchKey: string, ideas: [{title, query, tags?}] }. " +
              "No extra keys, no commentary.",
          },
          { role: "user", content: JSON.stringify(prompt) },
        ],
      }),
    });

    if (!res.ok) return null;
    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content;
    const parsed = safeJsonParse(text);
    return sanitizeIdeas(parsed);
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

function buildDeterministicOptions(input: {
  bestTitle?: string | null;
  cuisineHint?: string | null;
  deficitText?: string | null;
}): DishOption[] {
  const a = clampStr(input.bestTitle || "High-protein bowl", 60);
  const cuisine = clampStr(input.cuisineHint || "", 24);

  const opt1: DishOption = {
    id: "opt_1",
    title: a || "High-protein bowl",
    mode: "eatout",
    searchKey: a || "high protein bowl",
    tags: ["Best"],
    why: input.deficitText ? `Supports: ${clampStr(input.deficitText, 40)}` : "Simple, balanced choice.",
    confidence: 0.6,
  };

  const opt2Title = cuisine ? `${cuisine} lean plate` : "Greek chicken salad";
  const opt2Query = cuisine ? `${cuisine} grilled chicken` : "greek chicken salad";
  const opt2: DishOption = {
    id: "opt_2",
    title: clampStr(opt2Title, 60),
    mode: "eatout",
    searchKey: clampStr(opt2Query, 80),
    tags: ["Option"],
    why: "Lean protein + greens.",
    confidence: 0.5,
  };

  const opt3: DishOption = {
    id: "opt_3",
    title: "Salmon + veggies",
    mode: "eatout",
    searchKey: "salmon vegetables",
    tags: ["Option"],
    why: "Protein + micronutrients.",
    confidence: 0.45,
  };

  return [opt1, opt2, opt3].slice(0, 3);
}

function mergeAiIdeasIntoOptions(options: DishOption[], ai: DishIdea[] | null): DishOption[] {
  if (!ai?.length) return options;
  const next = [...options];
  for (let i = 0; i < Math.min(next.length, ai.length); i++) {
    next[i] = {
      ...next[i],
      title: ai[i]?.title || next[i].title,
      searchKey: ai[i]?.query || next[i].searchKey,
      tags: Array.isArray(ai[i]?.tags) && ai[i]!.tags!.length
        ? ai[i]!.tags!.slice(0, 2)
        : next[i].tags,
    };
  }
  return next;
}

function buildExecutionPlanFromOptions(options: DishOption[]): ExecutionPlan | null {
  const primary = options?.[0];
  if (!primary?.id) return null;

  // Phase 1: we keep this minimal and "searchKey-first"
  const searchKey = primary.searchKey || primary.title;
  return {
    version: 1,
    primaryOptionId: primary.id,
    steps: [{ type: "eatout_search", searchKey }],
    disclosure: { shareMode: "qr_reserved", shareToken: null, expiresAt: null },
  };
}

/* -------------------------------- Service -------------------------------- */

export async function getHomeSummary(req: Request, opts: { window: HomeWindow; limit: number }) {
  const ctx = getCtx(req);
  const db = getDb(req);

  const subjectMemberId = ctx.activeMemberId;
  if (!ctx.allowedMemberIds.includes(subjectMemberId)) throw new Error("MEMBER_NOT_ALLOWED");

  // ---- Mode
  const syncOn = isSyncEnabled(db, ctx.userId);
  const syncMode: "sync" | "privacy" = syncOn ? "sync" : "privacy";

  const userPrefs = syncOn ? readUserPrefsSyncOnly(db, ctx.userId) : null;
  const localIntelOrNull = null;

  // ---- Window query
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

  // ---- Normalize + hero score
  const scores: number[] = [];
  const normalized = rows.map((r: any) => {
    const s = clampScore(r.score);
    if (s != null) scores.push(s);
    return { logId: r.logId, capturedAt: r.capturedAt ?? null, mealType: r.mealType ?? null, summary: r.summary ?? null, score: s };
  });

  const hasData = scores.length > 0;
  const avgScore = hasData ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
  const status = statusForScore(avgScore, hasData);

  // ---- 14d behavior (always)
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

  const behavior14d = compute14DayBehavior(rows14d);

  // ---- Daily intelligence only
  const profileSummary = buildProfileSummary({
    mode: syncMode,
    preferences: syncOn ? userPrefs : null,
    intel: localIntelOrNull,
  });

  const todayTotals = opts.window === "daily" ? computeTodayTotals(rows) : null;

  const vector =
    opts.window === "daily" && todayTotals
      ? buildDailyVector2({ profile: profileSummary, consumed: todayTotals, behavior14d })
      : null;

  // Legacy (optional) – keep for now for copy/text until UI switches fully
  const bestNextMeal =
    opts.window === "daily" && vector
      ? getBestNextMealV2({ profile: profileSummary, vector, behavior14d })
      : null;

  // --- Macro Gap Engine v1 (authoritative)
  //const prefsKey = syncOn ? JSON.stringify(userPrefs?.cuisines ?? []) : "";
  const prefsKey = syncOn ? prefsFingerprint(userPrefs) : "";
  const day = startOfLocalDayIso(now).slice(0, 10);
  const planCacheKey = `home_plan_v1:${ctx.userId}:${subjectMemberId}:${day}:${syncMode}:${prefsKey}`;
  const cacheKey = `macro_v1:${ctx.userId}:${subjectMemberId}:${now.toISOString().slice(0,10)}:${syncMode}:${prefsKey}`;
 

  type MacroPlanBundle = {
    intent: any;        // BestNextMealIntent from macro-gap.ts
    options: any[];     // DishOption from macro-gap.ts
    plan: any;          // ExecutionPlan from macro-gap.ts
    vector: any;        // DailyVector2
  };

  let macroBundle: MacroPlanBundle | null =
    opts.window === "daily" ? cacheGet<MacroPlanBundle>(planCacheKey) : null;

  if (!macroBundle && opts.window === "daily" && profileSummary && todayTotals) {
    const built = buildMacroGapExecutionPlan({
      mode: syncMode,
      profile: profileSummary,
      consumed: todayTotals,
      behavior14d,
      ttlMinutes: 5,
      maxOptions: 2,
      now,
    });

    macroBundle = {
      intent: built.intent,
      plan: built.plan,
      vector: built.vector,
      options: built.options,
    };

    cacheSet(cacheKey, 5 * 60_000, macroBundle);
  }


  // Deterministic options now come from macro-gap module
  const deterministicOptions: DishOption[] =
    opts.window === "daily" && macroBundle?.options?.length
      ? macroBundle.options.map((o: any, idx: number) => ({
        id: `mg_${o.id || idx + 1}`,
        title: o.title,
        mode: o.executionHints?.channel === "home" ? "home" : "eatout",
        searchKey: o.executionHints?.searchKey ?? o.title,
        tags: Array.isArray(o.tags) ? o.tags.slice(0, 2) : [],
        why: o.why ?? null,
        confidence: typeof o.confidence === "number" ? o.confidence : null,
      }))
      : [];


  // ---- AI refinement (Sync-only, daily-only, never blocks)
  let refinedOptions = deterministicOptions;
  let restaurantSearchKey: string | null =
  refinedOptions.find(o => o.mode === "eatout")?.searchKey ?? null;


  if (opts.window === "daily" && syncOn && refinedOptions.length) {

    const guard = getHomeAiGuard(req);
    if (!guard.used()) {
      guard.mark();

      const apiKey = process.env.OPENAI_API_KEY || "";
      const model = process.env.OPENAI_MODEL_HOME_IDEAS || "gpt-4o-mini";

      if (apiKey) {
        const bullets =
          Array.isArray((bestNextMeal as any)?.meta?.bullets)
            ? (bestNextMeal as any).meta.bullets.slice(0, 6)
            : [
              macroBundle?.intent?.context?.macroGap?.summary?.proteinGap_g ? "Close protein gap" : "Balanced protein",
              macroBundle?.intent?.context?.macroGap?.summary?.fiberGap_g ? "Add fiber" : "Add vegetables",
              macroBundle?.intent?.context?.macroGap?.summary?.sodiumRisk === "high" ? "Keep sodium low" : "Watch sodium",
              macroBundle?.intent?.context?.macroGap?.summary?.sugarRisk === "high" ? "Keep added sugar low" : "Avoid sweet drinks",
            ].filter(Boolean).slice(0, 6);


        const recentSummaries = rows
          .map((r: any) => (typeof r?.summary === "string" ? r.summary : ""))
          .filter(Boolean)
          .slice(0, 8);

        try {
          const ai = await withTimeout(
            generateDishIdeasAI({
              apiKey,
              model,
              bullets,
              cuisineHint: behavior14d?.commonCuisine ?? null,
              recentSummaries,
              aiPersonality: userPrefs?.aiPersonality ?? "straight",
            }),
            1600
          );

          if (ai?.ideas?.length) {
            refinedOptions = applyAiIdeasToEatoutOnly(refinedOptions, ai.ideas);

            // Keep authoritative plan aligned with refined primary option (Sync-only refinement)
            if (opts.window === "daily" && macroBundle?.plan) {
              macroBundle.plan = patchPlanSearchKeyFromRefined(macroBundle.plan, refinedOptions);
            }

            const firstEatoutAfterAi = refinedOptions.find(o => o.mode === "eatout");
restaurantSearchKey =
  ai.searchKey || firstEatoutAfterAi?.searchKey || restaurantSearchKey;

          }
        } catch {
          // swallow: Home must never block
        }
      }
    }
  }

  // ---- Fallback if no AI + no deterministic (shouldn't happen, but safe)

  if (opts.window === "daily" && bestNextMeal && (!refinedOptions || !refinedOptions.length)) {
    refinedOptions = buildDeterministicOptions({
      bestTitle: bestNextMeal.title,
      cuisineHint: behavior14d?.commonCuisine ?? null,
      deficitText: vector?.deficitOfDay?.text ?? null,
    });
    restaurantSearchKey = refinedOptions[0]?.searchKey ?? restaurantSearchKey;
  }

  const intent = opts.window === "daily" ? (macroBundle?.intent ?? null) : null;
  const executionPlan = opts.window === "daily" ? (macroBundle?.plan ?? null) : null;


  // ---- UI payload fields
  let todaysFocus: any = null;
  let suggestion: any = null;

  const mgSummary = macroBundle?.intent?.context?.macroGap?.summary ?? null;
  const tw = macroBundle?.intent?.context?.timeWindow ?? null;
  
  if (opts.window === "daily" && vector && todayTotals) {
    const chips: Array<{ key: string; label: string; valueText: string }> = [];
  
    // Alignment (prefer Protein; if not meaningful, show Fiber)
    if (mgSummary?.proteinGap_g && mgSummary.proteinGap_g >= 10) {
      chips.push({ key: "align", label: "Alignment", valueText: `Protein +${Math.round(mgSummary.proteinGap_g)}g` });
    } else if (mgSummary?.fiberGap_g && mgSummary.fiberGap_g >= 4) {
      chips.push({ key: "align", label: "Alignment", valueText: `Fiber +${Math.round(mgSummary.fiberGap_g)}g` });
    }
  
    // Watchout (top only)
    const top = pickTopWatchout(mgSummary);
    if (top) chips.push({ key: "watch", label: top.label, valueText: top.valueText });
  
    // Budget
    if (Number.isFinite(mgSummary?.caloriesRemaining)) {
      chips.push({ key: "budget", label: "Budget", valueText: `${Math.round(mgSummary.caloriesRemaining)} cal left` });
    }
  
    // Window
    if (tw) {
      const w = String(tw);
      chips.push({ key: "win", label: "Window", valueText: w.charAt(0).toUpperCase() + w.slice(1) });
    }
  
    todaysFocus = {
      title: "Today Focus",
      chips: chips.slice(0, 4),
      totals: todayTotals,
    };

    const countedRowsToday =
      opts.window === "daily" ? rows.filter((r: any) => hasAnyNumericEstimate(getEstimatesFromRow(r))).length : 0;

    const totalRowsToday = opts.window === "daily" ? rows.length : 0;
    const estimateCoverage = totalRowsToday > 0 ? countedRowsToday / totalRowsToday : 0;

    const behaviorConfidence = behavior14d ? 1 : 0;
    const suggestionConfidence = clamp01(0.55 * estimateCoverage + 0.45 * behaviorConfidence);
    const confidenceLabel = suggestionConfidence >= 0.75 ? "high" : suggestionConfidence >= 0.45 ? "medium" : "low";

    const firstEatout = refinedOptions.find(o => o.mode === "eatout");
    const planSearchKey = executionPlan?.actions?.goEatOut?.searchKey ?? null;


    suggestion =
      refinedOptions.length
        ? {
          title: bestNextMeal?.title ?? refinedOptions[0]?.title ?? "Best Next Meal",
          suggestionText: bestNextMeal?.suggestionText ?? refinedOptions[0]?.why ?? null,
          contextNote: bestNextMeal?.contextNote ?? null,

          confidence: suggestionConfidence,
          confidenceLabel,

          dishIdeas: refinedOptions.map((o) => ({
            title: o.title,
            query: o.searchKey ?? o.title,
            tags: o.tags ?? [],
          })),

          // intent-first objects (authoritative)
          intent,
          executionPlan,

          // keep current routing field alive for current EatOut
          route: { searchKey: planSearchKey ?? firstEatout?.searchKey ?? restaurantSearchKey ?? "" },
        }
        : null;


  }

  return {
    meta: {
      window: opts.window,
      generatedAt: now.toISOString(),
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
    todaysFocus,
    todayTotals, // keep
    suggestion,
    recentLogs: { items: normalized.slice(0, opts.limit) },
  };
}
