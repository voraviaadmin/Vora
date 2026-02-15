// src/intelligence/macro-gap.ts
// PURE module: deterministic macro-gap + option synthesis + ExecutionPlan builder.
// No storage, no API calls, no OpenAI calls.
// Uses engine.ts primitives for targets/consumed math to stay consistent.

import {
    AppMode,
    ProfileSummary,
    DailyVector2,
    TimeWindow,
    DailyConsumed,
    DailyTargets,
    Behavior14Day,
    buildDailyVector2,
   // inferTimeWindow, // if inferTimeWindow is NOT exported today, copy its logic locally below
  } from "./engine";
  
  // ----------------------------
  // Contracts (Intent-first)
  // ----------------------------
  
  export type MacroKey = "calories" | "protein" | "fiber" | "sugar" | "sodium";
  
  export type MacroGap = {
    consumed: DailyConsumed;
    targets: DailyTargets;
  
    // Positive gap means "need more" (e.g., protein/fiber).
    // Positive risk means "already high / nearing max" (e.g., sugar/sodium).
    delta: {
      calories: number;
      protein_g: number;
      fiber_g: number;
      sugar_g_remaining: number;   // remaining to max
      sodium_mg_remaining: number; // remaining to max
    };
  
    summary: {
      proteinGap_g: number;
      fiberGap_g: number;
      caloriesRemaining: number;
      sugarRisk: "low" | "medium" | "high";
      sodiumRisk: "low" | "medium" | "high";
    };
  
    confidence: number; // 0..1
  };
  

  function stableHash32(s: string): number {
    // FNV-1a 32-bit
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
  }
  
  function uniqNormalized(list: string[]): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const raw of list) {
      const v = String(raw ?? "").trim();
      if (!v) continue;
      const key = v.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(v);
    }
    return out;
  }
  
  function pickCuisineHint(args: {
    profileCuisines?: string[] | null;
    behaviorCuisine?: string | null;
    now: Date;
    userId?: string;
    memberId?: string;
    intentId?: string;
  }): string | null {
    const profile = uniqNormalized(args.profileCuisines ?? []);
    const behavior = args.behaviorCuisine?.trim() ? String(args.behaviorCuisine).trim() : null;
  
    if (profile.length) {
      const weighted = behavior
        ? [behavior, ...profile.filter(c => c.toLowerCase() !== behavior.toLowerCase())]
        : profile;
  
      const day = args.now.toISOString().slice(0, 10);
  
      // ✅ fingerprint makes it reactive when cuisines change (even same day)
      const cuisinesFp = stableHash32(weighted.map(c => c.toLowerCase()).join("|"));
  
      // ✅ stable per user/member/day + intent, but changes when cuisines list changes
      const seed = `${args.userId ?? ""}|${args.memberId ?? ""}|${args.intentId ?? ""}|${day}|${cuisinesFp}`;
      const idx = stableHash32(seed) % weighted.length;
  
      return weighted[idx];
    }
  
    return behavior ?? null;
  }
  
  


  export type BestNextMealIntent = {
    intentId: string; // stable per user/day/member
    generatedAt: string; // ISO
    expiresAt: string; // ISO TTL
    mode: AppMode;
  
    context: {
      timeWindow: TimeWindow;
      cuisines: string[]; // normalized
      goal: "lose" | "maintain" | "gain";
      macroGap: MacroGap;
  
      // minimal behavior context (optional)
      behavior14d?: {
        commonCuisine?: string | null;
        highSodiumDaysPct?: number;
        lowProteinDaysPct?: number;
        lateEatingPct?: number;
      } | null;
    };
  
    decisionPolicy: {
      maxOptions: 2 | 3;
      minimizeChoice: true;
      fallbackIfLowConfidence: "ask-one-question" | "show-two-safe-defaults";
    };
  };
  
  export type DishOption = {
    id: string;
    title: string;
    why: string;       // calm 1-liner
    tags: string[];    // max 2
    confidence: number; // 0..1
  
    executionHints: {
      channel: "eatout" | "home" | "hybrid";
      searchKey: string; // phase-1 executor key (platform-neutral)
      constraints: string[]; // e.g. ["high-protein", "low-sodium"]
    };
  
    handoff: {
      // future-safe stubs
      qrPayload?: Record<string, any> | null;
      restaurantFilter?: Record<string, any> | null;
    };
  };
  
  export type ExecutionPlan = {
    planId: string;
    intentId: string;
  
    primaryOption: DishOption;
    secondaryOption?: DishOption | null;
  
    microSteps: string[]; // 3–6 max
    actions: {
      goEatOut?: { searchKey: string } | null;
      howToCook?: { optionId: string } | null; // future
      logAfterMealPrompt?: { prompt: string } | null;
    };
  
    meta: {
      confidence: number; // 0..1 overall
      expiresAt: string;
    };
  };
  
  // ----------------------------
  // Public API
  // ----------------------------
  
  export function computeMacroGapFromVector(vector: DailyVector2): MacroGap {
    const consumed = vector.consumed;
    const targets = vector.targets;
  
    const sugarRemain = Math.max(0, targets.sugar_g_max - consumed.sugar_g);
    const sodiumRemain = Math.max(0, targets.sodium_mg_max - consumed.sodium_mg);
  
    const sugarPct = targets.sugar_g_max > 0 ? consumed.sugar_g / targets.sugar_g_max : 0;
    const sodiumPct = targets.sodium_mg_max > 0 ? consumed.sodium_mg / targets.sodium_mg_max : 0;
  
    const sugarRisk = sugarPct >= 0.85 ? "high" : sugarPct >= 0.65 ? "medium" : "low";
    const sodiumRisk = sodiumPct >= 0.85 ? "high" : sodiumPct >= 0.65 ? "medium" : "low";
  
    return {
      consumed,
      targets,
      delta: {
        calories: Math.max(0, targets.calories - consumed.calories),
        protein_g: Math.max(0, targets.protein_g - consumed.protein_g),
        fiber_g: Math.max(0, targets.fiber_g_min - consumed.fiber_g),
        sugar_g_remaining: sugarRemain,
        sodium_mg_remaining: sodiumRemain,
      },
      summary: {
        proteinGap_g: Math.max(0, targets.protein_g - consumed.protein_g),
        fiberGap_g: Math.max(0, targets.fiber_g_min - consumed.fiber_g),
        caloriesRemaining: Math.max(0, targets.calories - consumed.calories),
        sugarRisk,
        sodiumRisk,
      },
      confidence: clamp01(vector.confidence),
    };
  }
  
  export function buildBestNextMealIntent(input: {
    mode: AppMode;
    profile: ProfileSummary;
    vector: DailyVector2;
    behavior14d?: Behavior14Day | null;
    now?: Date;
    ttlMinutes?: number;
    maxOptions?: 2 | 3;
  }): BestNextMealIntent {
  
    const now = input.now ?? new Date();
    const ttlMinutes = input.ttlMinutes ?? 10;
    const expiresAt = new Date(now.getTime() + ttlMinutes * 60_000);
  
    const timeWindow = safeInferTimeWindow(input.profile, now);
    const macroGap = computeMacroGapFromVector(input.vector);
  
    const goal = input.profile.derived.primaryGoal ?? "maintain";
  
// intentId first ✅
const intentId = stableIntentId({
  mode: input.mode,
  yyyyMmDd: isoDay(now),
  timeWindow,
});

// cuisines (reactive + weighted + deterministic)
const profileCuisines = Array.isArray(input.profile?.preferences?.cuisines)
  ? input.profile.preferences.cuisines.map(String)
  : [];

const behaviorCuisine = input.behavior14d?.commonCuisine ? String(input.behavior14d.commonCuisine) : null;

const cuisineHint = pickCuisineHint({
  profileCuisines,
  behaviorCuisine,
  now,
  // If you can add these fields to ProfileSummary, do it. If not, leave undefined.
  userId: (input.profile as any)?.userId,
  memberId: (input.profile as any)?.memberId,
  intentId,
});

const cuisines = cuisineHint ? [cuisineHint] : [];

  
    // ✅ 3. Return intent
    return {
      intentId,
      generatedAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      mode: input.mode,
      context: {
        timeWindow,
        cuisines,
        goal,
        macroGap,
        behavior14d: input.behavior14d
  ? {
      commonCuisine: input.behavior14d.commonCuisine ?? null,
      highSodiumDaysPct: input.behavior14d.highSodiumDaysPct,
      lowProteinDaysPct: input.behavior14d.lowProteinDaysPct,
      lateEatingPct: input.behavior14d.lateEatingPct,
    }
  : null,
      },
      decisionPolicy: {
        maxOptions: input.maxOptions ?? 2,
        minimizeChoice: true,
        fallbackIfLowConfidence:
          macroGap.confidence < 0.45
            ? "ask-one-question"
            : "show-two-safe-defaults",
      },
    };
  }
  
  

  function pickCuisineReactive(input: {
    prefs?: string[];
    behaviorCuisine?: string | null;
    intentId: string;
  }) {
    const prefs = (input.prefs ?? []).filter(Boolean);
    const behavior = input.behaviorCuisine ?? null;
  
    if (!prefs.length) return behavior;
  
    // If behavior cuisine is one of the prefs, prefer it.
    if (behavior && prefs.some(p => p.toLowerCase() === behavior.toLowerCase())) return behavior;
  
    // Otherwise rotate deterministically by day/intentId so it doesn’t always use [0]
    let h = 0;
    for (let i = 0; i < input.intentId.length; i++) h = (h * 31 + input.intentId.charCodeAt(i)) >>> 0;
    return prefs[h % prefs.length];
  }
  
  export function buildDeterministicDishOptions(input: {
    intent: BestNextMealIntent;
  }): DishOption[] {
    const { macroGap, cuisines, timeWindow } = input.intent.context;
    const cuisineHint = cuisines[0] ?? "healthy";
  
    // Primary drivers
    const needsProtein = macroGap.summary.proteinGap_g >= 20;
    const needsFiber = macroGap.summary.fiberGap_g >= 6;
    const sodiumHigh = macroGap.summary.sodiumRisk === "high";
    const sugarHigh = macroGap.summary.sugarRisk === "high";
  
    const constraints: string[] = [];
    if (needsProtein) constraints.push("high-protein");
    if (needsFiber) constraints.push("high-fiber");
    if (sodiumHigh) constraints.push("low-sodium");
    if (sugarHigh) constraints.push("low-sugar");


  
    // Keep it premium: 2–3 options max, calm and executable.
    const options: DishOption[] = [];
  
    // Option A (most universal): protein + veg bowl / plate
    options.push(
      makeOption({
        id: "opt_a",
        title: pickTitle(timeWindow, cuisineHint, "protein_plate"),
        why: buildWhy({ needsProtein, needsFiber, sodiumHigh, sugarHigh }),
        tags: pickTags({ needsProtein, sodiumHigh }),
        confidence: baseOptionConfidence(macroGap.confidence, { needsProtein, sodiumHigh, sugarHigh }),
        channel: "eatout",
        searchKey: buildSearchKey(cuisineHint, [
          needsProtein ? "grilled chicken" : "lean protein",
          "vegetables",
          sodiumHigh ? "no sauce" : null,
        ]),
        constraints,
      })
    );
  
    // Option B: salad + protein (low sodium/sugar friendly)
    options.push(
      makeOption({
        id: "opt_b",
        title: cuisineHint ? `${cuisineHint} salad + protein` : "Salad + protein",
        why: sodiumHigh
          ? "Keeps sodium under control while closing your protein gap."
          : "Light but filling: protein + fiber without overdoing calories.",
        tags: pickTags({ needsProtein, sodiumHigh }),
        confidence: baseOptionConfidence(macroGap.confidence, { needsProtein, sodiumHigh, sugarHigh }) - 0.05,
        channel: "eatout",
        searchKey: buildSearchKey(cuisineHint, [
          "salad",
          needsProtein ? "double chicken" : "protein add-on",
          sodiumHigh ? "dressing on side" : null,
        ]),
        constraints,
      })
    );
  
    // Option C (only if fiber gap is meaningful OR calories remaining high): beans/whole grains bowl
    if (input.intent.decisionPolicy.maxOptions === 3 && (needsFiber || macroGap.summary.caloriesRemaining >= 550)) {
      options.push(
        makeOption({
          id: "opt_c",
          title: cuisineHint ? `${cuisineHint} bowl (beans + veg)` : "Bowl (beans + veg)",
          why: needsFiber
            ? "Beans + vegetables close your fiber gap fast."
            : "Balanced bowl: steady energy without a sugar spike.",
          tags: ["fiber", needsProtein ? "protein" : "balanced"].slice(0, 2),
          confidence: clamp01(baseOptionConfidence(macroGap.confidence, { needsProtein, sodiumHigh, sugarHigh }) - 0.08),
          channel: "eatout",
          searchKey: buildSearchKey(cuisineHint, [
            "bowl",
            "beans",
            needsProtein ? "add chicken" : null,
            sodiumHigh ? "light salsa" : null,
          ]),
          constraints,
        })
      );
    }
  
    // Enforce max 2 tags, max options
    const max = input.intent.decisionPolicy.maxOptions;
    return options
      .map((o) => ({ ...o, tags: (o.tags ?? []).slice(0, 2) }))
      .slice(0, max);
  }
  
  export function buildExecutionPlan(input: {
    intent: BestNextMealIntent;
    options: DishOption[];
    now?: Date;
  }): ExecutionPlan {
    const now = input.now ?? new Date();
    const planId = `plan_${input.intent.intentId}_${now.getTime()}`;
  
    const [primary, secondary] = input.options;
  
    const microSteps = buildMicroSteps({
      primary,
      timeWindow: input.intent.context.timeWindow,
      sodiumRisk: input.intent.context.macroGap.summary.sodiumRisk,
      sugarRisk: input.intent.context.macroGap.summary.sugarRisk,
    });
  
    const overallConfidence = clamp01(
      // weighted: intent confidence + primary option
      0.55 * input.intent.context.macroGap.confidence + 0.45 * (primary?.confidence ?? 0.4)
    );
  
    return {
      planId,
      intentId: input.intent.intentId,
      primaryOption: primary,
      secondaryOption: secondary ?? null,
      microSteps,
      actions: {
        goEatOut: primary?.executionHints?.channel !== "home"
          ? { searchKey: primary.executionHints.searchKey }
          : null,
        howToCook: primary?.executionHints?.channel !== "eatout"
          ? { optionId: primary.id }
          : null,
        logAfterMealPrompt: { prompt: "Log this meal after you eat (10 seconds)." },
      },
      meta: {
        confidence: overallConfidence,
        expiresAt: input.intent.expiresAt,
      },
    };
  }
  
  // Convenience: build everything with your existing vector math
  export function buildMacroGapExecutionPlan(input: {
    mode: AppMode;
    profile: ProfileSummary;
    consumed?: Partial<DailyConsumed> | null;
    targetsOverride?: Partial<DailyTargets> | null;
    behavior14d?: Behavior14Day | null;
    ttlMinutes?: number;
    maxOptions?: 2 | 3;
    now?: Date;
  }): { intent: BestNextMealIntent; options: DishOption[]; plan: ExecutionPlan; vector: DailyVector2 } {
    const vector = buildDailyVector2({
      profile: input.profile,
      consumed: input.consumed ?? null,
      targetsOverride: input.targetsOverride ?? null,
      behavior14d: input.behavior14d ?? null,
    });
  
    const intent = buildBestNextMealIntent({
      mode: input.mode,
      profile: input.profile,
      vector,
      behavior14d: input.behavior14d ?? null,
      now: input.now,
      ttlMinutes: input.ttlMinutes,
      maxOptions: input.maxOptions,
    });
  


    const options = buildDeterministicDishOptions({ intent });
    const plan = buildExecutionPlan({ intent, options, now: input.now });
  
    return { intent, options, plan, vector };
  }
  
  // ----------------------------
  // Internals
  // ----------------------------
  
  function makeOption(input: {
    id: string;
    title: string;
    why: string;
    tags: string[];
    confidence: number;
    channel: "eatout" | "home" | "hybrid";
    searchKey: string;
    constraints: string[];
  }): DishOption {
    return {
      id: input.id,
      title: input.title,
      why: input.why,
      tags: input.tags.slice(0, 2),
      confidence: clamp01(input.confidence),
      executionHints: {
        channel: input.channel,
        searchKey: input.searchKey,
        constraints: uniqStrings(input.constraints).slice(0, 6),
      },
      handoff: {
        qrPayload: null,
        restaurantFilter: null,
      },
    };
  }
  
  function pickTitle(timeWindow: TimeWindow, cuisineHint: string, kind: "protein_plate") {
    if (kind === "protein_plate") {
      const base = timeWindow === "breakfast" ? "Protein breakfast" : "Lean protein plate";
      return cuisineHint ? `${base} • ${cuisineHint}` : base;
    }
    return "Best option";
  }
  
  function buildWhy(input: { needsProtein: boolean; needsFiber: boolean; sodiumHigh: boolean; sugarHigh: boolean }) {
    if (input.sodiumHigh) return "High-protein, lighter on sodium—simple win for today.";
    if (input.sugarHigh) return "High-protein, low added sugar—keeps the day on track.";
    if (input.needsProtein && input.needsFiber) return "Closes protein + fiber gaps with minimal decision-making.";
    if (input.needsProtein) return "Fastest way to close your protein gap this meal.";
    if (input.needsFiber) return "Adds fiber without blowing calories.";
    return "Balanced, easy to execute.";
  }
  
  function pickTags(input: { needsProtein: boolean; sodiumHigh: boolean }) {
    const tags: string[] = [];
    if (input.needsProtein) tags.push("protein");
    if (input.sodiumHigh) tags.push("low-sodium");
    if (!tags.length) tags.push("balanced");
    return tags.slice(0, 2);
  }
  
  function baseOptionConfidence(intentConfidence: number, ctx: { needsProtein: boolean; sodiumHigh: boolean; sugarHigh: boolean }) {
    let c = 0.45 + 0.45 * clamp01(intentConfidence);
    if (ctx.sodiumHigh || ctx.sugarHigh) c -= 0.05; // harder constraints reduce confidence slightly
    if (ctx.needsProtein) c += 0.03;
    return clamp01(c);
  }
  
  function buildSearchKey(cuisine: string, tokens: Array<string | null>) {
    const parts = [cuisine, ...tokens].filter(Boolean).map((s) => String(s).trim()).filter(Boolean);
    // platform-neutral, stable, debuggable
    return parts.join(" | ").toLowerCase();
  }
  
  function buildMicroSteps(input: {
    primary: DishOption;
    timeWindow: TimeWindow;
    sodiumRisk: "low" | "medium" | "high";
    sugarRisk: "low" | "medium" | "high";
  }): string[] {
    const steps: string[] = [];
  
    steps.push(`Pick: "${input.primary.title}".`);
    steps.push("Order with sauce/dressing on the side.");
  
    if (input.sodiumRisk === "high") steps.push("Ask for light salt / no extra seasoning.");
    if (input.sugarRisk === "high") steps.push("Skip sweet drinks; choose water/unsweetened.");
  
    steps.push("Eat protein first, then vegetables.");
    steps.push("Log it after (10 seconds).");
  
    return steps.slice(0, 6);
  }
  
  function stableIntentId(input: { userId?: string; memberId?: string; mode: AppMode; yyyyMmDd: string; timeWindow: TimeWindow }) {
    return `intent_${input.userId ?? "u"}_${input.memberId ?? "m"}_${input.mode}_${input.yyyyMmDd}_${input.timeWindow}`;
  }
  
  
  function isoDay(d: Date) {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }
  
  function clamp01(n: number) {
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.min(1, n));
  }
  
  function uniqStrings(arr: string[]) {
    return Array.from(new Set(arr));
  }
  
  // If inferTimeWindow isn’t exported from engine.ts, keep a local copy:
  function safeInferTimeWindow(profile: ProfileSummary, now: Date): TimeWindow {
    try {
      // @ts-ignore
      if (typeof inferTimeWindow === "function") return inferTimeWindow(profile);
    } catch {}
    const h = now.getHours();
    if (h < 10) return "breakfast";
    if (h < 14) return "lunch";
    if (h < 17) return "snack";
    return "dinner";
  }
  