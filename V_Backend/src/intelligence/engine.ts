// src/intelligence/engine.ts
// PURE INTELLIGENCE ENGINE (no React, no storage, no API calls)
// Enforces: Premium UX (simple, no clutter) + Founder discipline (centralized, configurable, mode-safe)

export type AppMode = "privacy" | "sync";

// ----------------------------
// Profile types (minimal + compatible)
// ----------------------------

// Mirrors backend-safe preferences (do not break server contract)
export type Preferences = {
  health: {
    diabetes: boolean;
    highBP: boolean;
    fattyLiver: boolean;
  };
  goal: "lose" | "maintain" | "gain";
  cuisines: string[];
};

// Local-only intelligence layer (safe, optional)
export type GoalIntensity = "light" | "moderate" | "aggressive";
export type ActivityLevel = "sedentary" | "moderate" | "active";
export type EatingStyle = "home-heavy" | "eat-out-heavy" | "balanced";
export type ProteinPreference = "low" | "medium" | "high";
export type PortionAppetite = "small" | "average" | "large";
export type StressLevel = "low" | "moderate" | "high";

// Keep aligned with profile.tsx (local intel), but allow future additions safely.
export type ProfileIntel = {
  goalIntensity?: GoalIntensity;
  activityLevel?: ActivityLevel;
  eatingStyle?: EatingStyle;
  proteinPreference?: ProteinPreference;
  carbSensitive?: boolean;
  portionAppetite?: PortionAppetite;
  wakeTime?: string; // "07:30"
  mealsPerDay?: 2 | 3 | 4 | 5; // local only
  dinnerTime?: string; // "19:30" local only
  stressLevel?: StressLevel; // future predictive use
};

export type ProfileSummary = {
  mode: AppMode;

  // Sync-only server-backed prefs (must remain stable)
  preferences: Preferences | null;

  // Local-only intelligence signals
  intel: ProfileIntel;

  // Derived + normalized hints (safe for UI + scoring)
  derived: {
    cuisines: string[]; // normalized unique
    primaryGoal: Preferences["goal"] | "maintain"; // fallback
    goalIntensity: GoalIntensity | null;
    activityLevel: ActivityLevel | null;
    eatingStyle: EatingStyle | null;
    proteinPreference: ProteinPreference | null;
    carbSensitive: boolean | null;
    portionAppetite: PortionAppetite | null;
    wakeTime: string | null;
    dinnerTime: string | null;
    mealsPerDay: number | null;
    stressLevel: StressLevel | null;
  };

  // Compliance boundaries: prevents mode ambiguity upstream
  compliance: {
    canUseSyncProfile: boolean;
    canUseCloudAi: boolean; // "sync" => true, "privacy" => false
  };
};

// ----------------------------
// Daily Vector 2.0 (Home intelligence foundation)
// ----------------------------

export type TimeWindow = "breakfast" | "lunch" | "snack" | "dinner";

export type DailyTargets = {
  calories: number;
  protein_g: number;
  sugar_g_max: number;
  sodium_mg_max: number;
  fiber_g_min: number;
  carbs_g_min: number;
  fat_g_min: number;
};

export type DailyConsumed = {
  calories: number;
  protein_g: number;
  sugar_g: number;
  sodium_mg: number;
  fiber_g: number;
  carbs_g: number;
  fat_g: number;
};

export type DailyRemaining = {
  calories: number;
  protein_g: number;
  sugar_g: number;
  sodium_mg: number;
  fiber_g: number;
  carbs_g: number;
  fat_g: number;
};

// --- UPDATE: DailyVector2 (add behavior hint, keep minimal) ---
export type DailyVector2 = {
  targets: DailyTargets;
  consumed: DailyConsumed;
  remaining: DailyRemaining;

  deficitOfDay: { key: "protein" | "fiber" | "calories"; text: string } | null;
  overRisk: { key: "sugar" | "sodium" | "calories"; text: string } | null;
  warning: { text: string } | null;

  confidence: number; // 0..1

  // NEW: optional behavior context (not for UI spam, used for reasoning + confidence)
  behavior14d?: {
    commonCuisine?: string | null;
    highSodiumDaysPct?: number;
    lowProteinDaysPct?: number;
    lateEatingPct?: number;
  } | null;
};

// ----------------------------
// Best Next Meal v2 (Home hero output)
// ----------------------------

export type BestNextMealV2 = {
  title: string; // maps to Home suggestion.title
  suggestionText: string; // maps to Home suggestion.suggestionText (1–2 lines)
  contextNote?: string | null; // optional subtle note (mode/estimation/budget)

  // Optional structured details for future UI (kept minimal)
  meta?: {
    timeWindow: TimeWindow;
    confidence: number; // 0..1
    bullets: string[]; // max 3 (enforced)
    nextAction?: string | null; // max 1
  };
};


// --- UPDATE: Config (add behavior tuning knobs, still centralized) ---
export type IntelligenceConfig = {
  targets: {
    calories: { lose: number; maintain: number; gain: number };
    protein_g: { lose: number; maintain: number; gain: number };
    sugar_g_max: number;
    sodium_mg_max: number;
    fiber_g_min: number;
    carbs_g_min: number;
    fat_g_min: number;
  };

  multipliers: {
    goalIntensity: Partial<Record<GoalIntensity, { calories?: number; protein?: number }>>;
    activityLevel: Partial<Record<ActivityLevel, { calories?: number; protein?: number }>>;
  };

  thresholds: {
    proteinDeficit_g: number;
    fiberDeficit_g: number;
    sodiumRisk_pct: number;
    sugarRisk_pct: number;
    carbsRisk_pct: number;
    fatRisk_pct: number;
    fiberRisk_pct: number;

    // NEW: make the engine more sensitive if user repeatedly overshoots
    behaviorSodiumSensitivityBoost: number; // e.g. 0.1 => risk triggers 10% earlier
    behaviorProteinSensitivityBoost_g: number; // e.g. 10 => deficit triggers earlier
  };

  ux: {
    maxBullets: number;
    maxSuggestionChars: number;
  };
};

export const DEFAULT_INTELLIGENCE_CONFIG: IntelligenceConfig = {
  targets: {
    calories: { lose: 1800, maintain: 2200, gain: 2600 },
    protein_g: { lose: 130, maintain: 110, gain: 120 },
    sugar_g_max: 40,
    sodium_mg_max: 2300,
    fiber_g_min: 28,
    carbs_g_min: 28,
    fat_g_min: 28,
  },
  multipliers: {
    goalIntensity: {
      light: { calories: 1.0, protein: 1.0 },
      moderate: { calories: 0.95, protein: 1.05 },
      aggressive: { calories: 0.9, protein: 1.1 },
    },
    activityLevel: {
      sedentary: { calories: 0.95, protein: 1.0 },
      moderate: { calories: 1.0, protein: 1.0 },
      active: { calories: 1.08, protein: 1.05 },
    },
  },
  thresholds: {
    proteinDeficit_g: 25,
    fiberDeficit_g: 8,
    sodiumRisk_pct: 0.8,
    sugarRisk_pct: 0.8,
    carbsRisk_pct: 0.8,
    fatRisk_pct: 0.8,
    fiberRisk_pct: 0.8,
    behaviorSodiumSensitivityBoost: 0.1,
    behaviorProteinSensitivityBoost_g: 10,
  },
  ux: {
    maxBullets: 3,
    maxSuggestionChars: 160,
  },
};


function buildCookPlanFromIntent(intent: {
  proteinGap_g: number;
  caloriesRemaining?: number | null;
  cuisineHint?: string | null;
  sugarRisk?: string | null;
  sodiumRisk?: string | null;
}) {
  const proteinTarget = Math.max(30, Math.min(intent.proteinGap_g || 40, 60));

  const cuisine = (intent.cuisineHint || "balanced").toLowerCase();

  // Simple cuisine mapping
  let base = "Lean Protein Bowl";
  if (cuisine.includes("thai")) base = "Thai Lean Basil Bowl";
  if (cuisine.includes("japanese")) base = "Japanese Protein Bowl";
  if (cuisine.includes("mediterranean")) base = "Mediterranean Chicken Bowl";

  const ingredients = [
    { ingredient: "Chicken breast", grams: Math.round(proteinTarget * 3) },
    { ingredient: "Mixed vegetables", grams: 150 },
    { ingredient: "Cooked rice or quinoa", grams: 120 },
    { ingredient: "Olive oil", grams: 5 },
    { ingredient: "Fresh herbs or lemon", grams: 10 },
  ];

  return {
    dishName: base,
    ingredients,
    prepModules: [
      { step: 1, action: "Preheat pan", temperatureC: 190 },
      { step: 2, action: "Add olive oil" },
      { step: 3, action: "Cook chicken 5 min per side", timeMinutes: 10 },
      { step: 4, action: "Add vegetables 3–4 min", timeMinutes: 4 },
      { step: 5, action: "Assemble and serve" },
    ],
    totalMinutes: 12,
  };
}

// ----------------------------
// Public API (exactly 3 exports)
// ----------------------------

export function buildProfileSummary(input: {
  mode: AppMode;
  preferences?: Preferences | null; // provided only in sync when available
  intel?: ProfileIntel | null; // local-only optional
}): ProfileSummary {
  const mode = input.mode;
  const prefs = mode === "sync" ? input.preferences ?? null : null;

  const intel: ProfileIntel = input.intel ?? {};

  const cuisines = uniq(
    (prefs?.cuisines ?? []).map((c) => (c ?? "").trim()).filter(Boolean)
  );

  const primaryGoal: Preferences["goal"] =
    prefs?.goal ?? "maintain";

  const summary: ProfileSummary = {
    mode,
    preferences: prefs,
    intel,
    derived: {
      cuisines,
      primaryGoal,
      goalIntensity: intel.goalIntensity ?? null,
      activityLevel: intel.activityLevel ?? null,
      eatingStyle: intel.eatingStyle ?? null,
      proteinPreference: intel.proteinPreference ?? null,
      carbSensitive: typeof intel.carbSensitive === "boolean" ? intel.carbSensitive : null,
      portionAppetite: intel.portionAppetite ?? null,
      wakeTime: intel.wakeTime ?? null,
      dinnerTime: intel.dinnerTime ?? null,
      mealsPerDay: typeof intel.mealsPerDay === "number" ? intel.mealsPerDay : null,
      stressLevel: intel.stressLevel ?? null,
    },
    compliance: {
      canUseSyncProfile: mode === "sync",
      canUseCloudAi: mode === "sync",
    },
  };

  return summary;
}

// --- UPDATE: buildDailyVector2 input to accept behavior14d ---
export function buildDailyVector2(input: {
  profile: ProfileSummary;
  consumed?: Partial<DailyConsumed> | null;
  targetsOverride?: Partial<DailyTargets> | null;
  behavior14d?: Behavior14Day | null; // NEW
  config?: IntelligenceConfig;
}): DailyVector2 {
  const config = input.config ?? DEFAULT_INTELLIGENCE_CONFIG;

  // baseline targets (same as before)
  const goal = input.profile.derived.primaryGoal;
  let calories = config.targets.calories[goal];
  let protein = config.targets.protein_g[goal];

  const sugarMax = config.targets.sugar_g_max;
  const sodiumMax = config.targets.sodium_mg_max;
  const fiberMin = config.targets.fiber_g_min;
  const carbsMin = config.targets.carbs_g_min;
  const fatMin = config.targets.fat_g_min;
  
  const gi = input.profile.derived.goalIntensity;
  const al = input.profile.derived.activityLevel;

  if (gi && config.multipliers.goalIntensity[gi]) {
    const m = config.multipliers.goalIntensity[gi]!;
    if (typeof m.calories === "number") calories = Math.round(calories * m.calories);
    if (typeof m.protein === "number") protein = Math.round(protein * m.protein);
  }
  if (al && config.multipliers.activityLevel[al]) {
    const m = config.multipliers.activityLevel[al]!;
    if (typeof m.calories === "number") calories = Math.round(calories * m.calories);
    if (typeof m.protein === "number") protein = Math.round(protein * m.protein);
  }

  const targets: DailyTargets = {
    calories: input.targetsOverride?.calories ?? calories,
    protein_g: input.targetsOverride?.protein_g ?? protein,
    sugar_g_max: input.targetsOverride?.sugar_g_max ?? sugarMax,
    sodium_mg_max: input.targetsOverride?.sodium_mg_max ?? sodiumMax,
    fiber_g_min: input.targetsOverride?.fiber_g_min ?? fiberMin,
    carbs_g_min: input.targetsOverride?.carbs_g_min ?? carbsMin,
    fat_g_min: input.targetsOverride?.fat_g_min ?? fatMin,
  };

  const consumed: DailyConsumed = {
    calories: clampNum(input.consumed?.calories ?? 0),
    protein_g: clampNum(input.consumed?.protein_g ?? 0),
    sugar_g: clampNum(input.consumed?.sugar_g ?? 0),
    sodium_mg: clampNum(input.consumed?.sodium_mg ?? 0),
    fiber_g: clampNum(input.consumed?.fiber_g ?? 0),
    carbs_g: clampNum(input.consumed?.carbs_g ?? 0),
    fat_g: clampNum(input.consumed?.fat_g ?? 0),
  };

  const remaining: DailyRemaining = {
    calories: Math.max(0, targets.calories - consumed.calories),
    protein_g: Math.max(0, targets.protein_g - consumed.protein_g),
    sugar_g: Math.max(0, targets.sugar_g_max - consumed.sugar_g),
    sodium_mg: Math.max(0, targets.sodium_mg_max - consumed.sodium_mg),
    fiber_g: Math.max(0, targets.fiber_g_min - consumed.fiber_g),
    carbs_g: Math.max(0, targets.carbs_g_min - consumed.carbs_g),
    fat_g: Math.max(0, targets.fat_g_min - consumed.fat_g),
  };

  // NEW: behavior-aware sensitivity (still minimal, still centralized)
  const behavior = input.behavior14d ?? null;

  const sodiumRiskPct = adaptSodiumThreshold(config.thresholds.sodiumRisk_pct, behavior);
  const proteinDeficitThreshold = adaptProteinThreshold(config.thresholds.proteinDeficit_g, behavior);
  

  const deficit = pickDeficitBehaviorAware({ targets, consumed, remaining }, proteinDeficitThreshold, config);
  const risk = pickOverRiskBehaviorAware({ targets, consumed }, sodiumRiskPct, config);
  const warning = pickWarningBehaviorAware({ targets, consumed }, sodiumRiskPct, config);

  const confidence = computeConfidence({ consumed, behavior, mode: input.profile.mode });


  //console.log("Deficit:", deficit);
  //console.log("Risk:", risk);
  //console.log("Warning:", warning);
  //console.log("Confidence:", confidence);





  return {
    targets,
    consumed,
    remaining,
    deficitOfDay: deficit,
    overRisk: risk,
    warning,
    confidence,
    behavior14d: behavior
      ? {
          commonCuisine: behavior.commonCuisine ?? null,
          highSodiumDaysPct: behavior.highSodiumDaysPct,
          lowProteinDaysPct: behavior.lowProteinDaysPct,
          lateEatingPct: behavior.lateEatingPct,
        }
      : null,
  };
}

// --- UPDATE: getBestNextMealV2 accepts behavior14d and uses it (without clutter) ---
export function getBestNextMealV2(input: {
  profile: ProfileSummary;
  vector: DailyVector2;
  timeWindow?: TimeWindow | null;
  budgetHint?: string | null;
  behavior14d?: Behavior14Day | null; // NEW
  config?: IntelligenceConfig;
}): BestNextMealV2 {
  const config = input.config ?? DEFAULT_INTELLIGENCE_CONFIG;

  const timeWindow = input.timeWindow ?? inferTimeWindow(input.profile);
  const behavior = input.behavior14d ?? null;

  const bullets: string[] = [];

  // Deficit-driven guidance
  if (input.vector.deficitOfDay?.key === "protein") bullets.push("Prioritize a high-protein option.");
  if (input.vector.deficitOfDay?.key === "fiber") bullets.push("Add fiber (greens, beans, whole grains).");

  // Risk-driven guidance
  if (input.vector.overRisk?.key === "sodium") bullets.push("Keep sodium low (avoid heavy sauces).");
  if (input.vector.overRisk?.key === "sugar") bullets.push("Keep added sugar minimal.");

  // NEW: 14-day personalization (only one extra bullet max)
  // If user repeatedly overshoots sodium, bias toward low-sodium choice pattern.
  if (behavior?.highSodiumDaysPct && behavior.highSodiumDaysPct >= 0.6 && !bullets.some(b => b.toLowerCase().includes("sodium"))) {
    bullets.push("You’ve been trending high on sodium—go lighter today.");
  } else if (behavior?.lowProteinDaysPct && behavior.lowProteinDaysPct >= 0.6 && !bullets.some(b => b.toLowerCase().includes("protein"))) {
    bullets.push("Protein has been low recently—aim higher this meal.");
  }

  if (!bullets.length) bullets.push("Choose a balanced plate with lean protein + vegetables.");

  const cappedBullets = bullets.slice(0, config.ux.maxBullets);

  // Cuisine direction: prefer (1) behavior commonCuisine, else (2) profile cuisines[0]
  const cuisineHint = pickCuisineDirectionAdaptive(input.profile, behavior);

  const title = cuisineHint ? `Best next meal • ${cuisineHint}` : "Best next meal";

  const suggestionText = clampText(
    buildSuggestionLine(timeWindow, cappedBullets),
    config.ux.maxSuggestionChars
  );

  // Mode clarity with zero clutter
  const contextNote =
    input.profile.mode === "privacy"
      ? "Private estimate (on-device)."
      : null;

  return {
    title,
    suggestionText,
    contextNote,
    meta: {
      timeWindow,
      confidence: clamp01(input.vector.confidence),
      bullets: cappedBullets,
      nextAction: cuisineHint ? `Aim for ${cuisineHint} style choices.` : null,
    },
  };
}

// ----------------------------
// NEW helpers (private)
// ----------------------------

function tuneSodiumRiskPct(config: IntelligenceConfig, behavior: Behavior14Day | null) {
  if (!behavior) return config.thresholds.sodiumRisk_pct;
  // If high sodium days are frequent, trigger risk earlier (more sensitive)
  if (behavior.highSodiumDaysPct >= 0.6) {
    return Math.max(0.6, config.thresholds.sodiumRisk_pct - config.thresholds.behaviorSodiumSensitivityBoost);
  }
  return config.thresholds.sodiumRisk_pct;
}

function tuneProteinDeficitThreshold(config: IntelligenceConfig, behavior: Behavior14Day | null) {
  if (!behavior) return config.thresholds.proteinDeficit_g;
  // If protein low frequently, surface deficit earlier (more sensitive)
  if (behavior.lowProteinDaysPct >= 0.6) {
    return Math.max(10, config.thresholds.proteinDeficit_g - config.thresholds.behaviorProteinSensitivityBoost_g);
  }
  return config.thresholds.proteinDeficit_g;
}

function computeConfidence(input: { consumed: DailyConsumed; behavior: Behavior14Day | null; mode: AppMode }) {
  // Still intentionally conservative: don’t over-promise.
  let c = input.consumed.calories > 0 ? 0.65 : 0.35;
  if (input.behavior) c += 0.15; // having 14-day context increases confidence
  if (input.mode === "sync") c += 0.05; // sync has fuller context
  return clamp01(c);
}

function pickDeficitBehaviorAware(
  ctx: { targets: DailyTargets; consumed: DailyConsumed; remaining: DailyRemaining },
  proteinThreshold: number,
  config: IntelligenceConfig
): DailyVector2["deficitOfDay"] {
  const proteinDef = ctx.targets.protein_g - ctx.consumed.protein_g;
  const fiberDef = ctx.targets.fiber_g_min - ctx.consumed.fiber_g;

  if (proteinDef >= proteinThreshold) return { key: "protein", text: "Protein deficit" };
  if (fiberDef >= config.thresholds.fiberDeficit_g) return { key: "fiber", text: "Fiber deficit" };
  return null;
}

function pickOverRiskBehaviorAware(
  ctx: { targets: DailyTargets; consumed: DailyConsumed },
  sodiumRiskPct: number,
  config: IntelligenceConfig
): DailyVector2["overRisk"] {
  const sodiumPct = ctx.targets.sodium_mg_max > 0 ? ctx.consumed.sodium_mg / ctx.targets.sodium_mg_max : 0;
  const sugarPct = ctx.targets.sugar_g_max > 0 ? ctx.consumed.sugar_g / ctx.targets.sugar_g_max : 0;

  if (sodiumPct >= sodiumRiskPct) return { key: "sodium", text: "Sodium risk" };
  if (sugarPct >= config.thresholds.sugarRisk_pct) return { key: "sugar", text: "Sugar risk" };
  return null;
}

function pickWarningBehaviorAware(
  ctx: { targets: DailyTargets; consumed: DailyConsumed },
  sodiumRiskPct: number,
  config: IntelligenceConfig
): DailyVector2["warning"] {
  // one warning max (premium). use tighter threshold than risk.
  const sodiumPct = ctx.targets.sodium_mg_max > 0 ? ctx.consumed.sodium_mg / ctx.targets.sodium_mg_max : 0;
  if (sodiumPct >= Math.min(0.9, sodiumRiskPct + 0.1)) return { text: "At this pace, sodium may exceed by dinner." };

  const sugarPct = ctx.targets.sugar_g_max > 0 ? ctx.consumed.sugar_g / ctx.targets.sugar_g_max : 0;
  if (sugarPct >= 0.9) return { text: "Sugar is trending high today." };

  return null;
}

function pickCuisineDirectionAdaptive(profile: ProfileSummary, behavior?: Behavior14Day | null): string | null {
  if (behavior?.commonCuisine) return behavior.commonCuisine;
  if (profile.derived.cuisines.length) return profile.derived.cuisines[0];
  return null;
}




// ----------------------------
// Helpers (private)
// ----------------------------

function uniq(arr: string[]) {
  return Array.from(new Set(arr));
}

function clamp01(n: number) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function clampNum(n: any) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, v);
}

function clampText(s: string, max: number) {
  if (s.length <= max) return s;
  return s.slice(0, Math.max(0, max - 1)).trimEnd() + "…";
}

function pickDeficit(
  ctx: { targets: DailyTargets; consumed: DailyConsumed; remaining: DailyRemaining },
  config: IntelligenceConfig
): DailyVector2["deficitOfDay"] {
  const proteinDef = ctx.targets.protein_g - ctx.consumed.protein_g;
  const fiberDef = ctx.targets.fiber_g_min - ctx.consumed.fiber_g;

  if (proteinDef >= config.thresholds.proteinDeficit_g) {
    return { key: "protein", text: "Protein deficit" };
  }
  if (fiberDef >= config.thresholds.fiberDeficit_g) {
    return { key: "fiber", text: "Fiber deficit" };
  }
  return null;
}

function pickOverRisk(
  ctx: { targets: DailyTargets; consumed: DailyConsumed },
  config: IntelligenceConfig
): DailyVector2["overRisk"] {
  const sodiumPct = ctx.targets.sodium_mg_max > 0 ? ctx.consumed.sodium_mg / ctx.targets.sodium_mg_max : 0;
  const sugarPct = ctx.targets.sugar_g_max > 0 ? ctx.consumed.sugar_g / ctx.targets.sugar_g_max : 0;

  if (sodiumPct >= config.thresholds.sodiumRisk_pct) {
    return { key: "sodium", text: "Sodium risk" };
  }
  if (sugarPct >= config.thresholds.sugarRisk_pct) {
    return { key: "sugar", text: "Sugar risk" };
  }
  return null;
}

function pickWarning(
  ctx: { targets: DailyTargets; consumed: DailyConsumed },
  config: IntelligenceConfig
): DailyVector2["warning"] {
  // Keep only one warning, and only when clearly relevant.
  const sodiumPct = ctx.targets.sodium_mg_max > 0 ? ctx.consumed.sodium_mg / ctx.targets.sodium_mg_max : 0;
  if (sodiumPct >= 0.9) {
    return { text: "At this pace, sodium may exceed by dinner." };
  }
  const sugarPct = ctx.targets.sugar_g_max > 0 ? ctx.consumed.sugar_g / ctx.targets.sugar_g_max : 0;
  if (sugarPct >= 0.9) {
    return { text: "Sugar is trending high today." };
  }
  return null;
}

function inferTimeWindow(profile: ProfileSummary): TimeWindow {
  // Simple inference (no timezone math). Can be upgraded later with wake/dinner time.
  const h = new Date().getHours();
  if (h < 10) return "breakfast";
  if (h < 14) return "lunch";
  if (h < 17) return "snack";
  return "dinner";
}

function pickCuisineDirection(profile: ProfileSummary): string | null {
  const c = profile.derived.cuisines;
  if (!c.length) return null;
  // Keep deterministic: pick first. Later can rotate.
  return c[0];
}

function buildSuggestionLine(timeWindow: TimeWindow, bullets: string[]) {
  // Premium single paragraph (no verbose). Uses 1–2 key bullets.
  const prefix =
    timeWindow === "breakfast"
      ? "Breakfast:"
      : timeWindow === "lunch"
        ? "Lunch:"
        : timeWindow === "snack"
          ? "Snack:"
          : "Dinner:";

  // Use up to 2 bullets in the main text; keep the rest in meta for future UI if needed.
  const main = bullets.slice(0, 2).join(" ");
  return `${prefix} ${main}`;
}


// --- ADD: Behavior 14-day summary (computed by backend, not engine) ---
export type Behavior14Day = {
  // averages across last 14 days (or last N available days)
  avgCalories: number;
  avgProtein_g: number;
  avgSodium_mg: number;
  avgSugar_g: number;
  avgFiber_g: number;

  // pattern signals 0..1
  highSodiumDaysPct: number;   // % days above sodium target
  lowProteinDaysPct: number;   // % days below protein target
  highSugarDaysPct?: number;   // optional
  lowFiberDaysPct?: number;    // optional

  // preference inference
  commonCuisine?: string | null;
  cuisineTop3?: string[]; // optional
  commonMealWindow?: TimeWindow | null;

  // rhythm
  lateEatingPct?: number; // % meals after dinnerTime (if available)
};

function adaptSodiumThreshold(base: number, behavior?: Behavior14Day | null) {
  if (!behavior) return base;
  if (behavior.highSodiumDaysPct >= 0.6) {
    return Math.max(0.65, base - 0.1); // trigger earlier
  }
  return base;
}

function adaptProteinThreshold(base: number, behavior?: Behavior14Day | null) {
  if (!behavior) return base;
  if (behavior.lowProteinDaysPct >= 0.6) {
    return Math.max(10, base - 10);
  }
  return base;
}
