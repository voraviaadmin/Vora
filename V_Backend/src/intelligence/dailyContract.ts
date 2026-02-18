// V_Backend/src/intelligence/dailyContract.ts

export type ContractStatus = "draft" | "active" | "completed" | "failed" | "expired";
export type ContractKind = "macro_gap" | "decision" | "execution";

export type DailyContract = {
  id: string;
  dayKey: string;
  status: ContractStatus;

  kind: ContractKind;
  title: string;
  statement: string;
  why: string;

  metric: {
    name: "protein_g" | "fiber_g" | "calories_kcal" | "clean_meals";
    operator: ">=" | "<=" | "==";
    target: number;
    unit: "g" | "kcal" | "count";
  };

  progress: {
    current: number;
    target: number;
    pct: number;
  };

  playbook: Array<{
    id: string;
    label: string;
    route: "cook" | "eatout" | "either";
    payload?: any;
  }>;
};

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const pct = (cur: number, target: number) => (target <= 0 ? 0 : clamp(Math.round((cur / target) * 100), 0, 100));

export function computeDailyContract(args: {
  userId: string;
  dayKey: string; // YYYY-MM-DD in user local time
  macroGap: {
    protein_g?: number; // remaining needed (positive gap)
    fiber_g?: number;
    calories_kcal?: number; // remaining (negative => exceeded)
  };
  // optional pre-computed next actions from your deterministic engine:
  bestNextMealOptions?: Array<{ kind: "home" | "eatout"; title: string; payload?: any }>;
}): DailyContract {
  const { userId, dayKey, macroGap } = args;

  const proteinGap = Math.max(0, macroGap.protein_g ?? 0);
  const fiberGap = Math.max(0, macroGap.fiber_g ?? 0);

  const caloriesRemaining = macroGap.calories_kcal;
  const caloriesExceeded = caloriesRemaining != null && caloriesRemaining < 0 ? Math.abs(caloriesRemaining) : 0;

  // Choose ONE contract deterministically (v1)
  let contract: Omit<DailyContract, "id" | "dayKey" | "status">;

  if (proteinGap >= 35) {
    const target = Math.round(clamp(proteinGap, 35, 90));
    contract = {
      kind: "macro_gap",
      title: "Protein Close",
      statement: `Add +${target}g protein today.`,
      why: "One clean meal closes the gap.",
      metric: { name: "protein_g", operator: ">=", target, unit: "g" },
      progress: { current: 0, target, pct: 0 },
      playbook: [],
    };
  } else if (fiberGap >= 10) {
    const target = Math.round(clamp(fiberGap, 10, 25));
    contract = {
      kind: "macro_gap",
      title: "Fiber Rescue",
      statement: `Add +${target}g fiber today.`,
      why: "Fiber closes appetite + stabilizes the day.",
      metric: { name: "fiber_g", operator: ">=", target, unit: "g" },
      progress: { current: 0, target, pct: 0 },
      playbook: [],
    };
  } else if (caloriesExceeded >= 250) {
    const target = Math.round(clamp(caloriesExceeded, 250, 900));
    contract = {
      kind: "macro_gap",
      title: "Calorie Cap",
      statement: `Recover: stay within -${target} kcal from here.`,
      why: "Keep the next decision light and clean.",
      metric: { name: "calories_kcal", operator: "<=", target, unit: "kcal" },
      progress: { current: 0, target, pct: 0 },
      playbook: [],
    };
  } else {
    contract = {
      kind: "execution",
      title: "Clean Execution",
      statement: "Complete 2 clean meals today.",
      why: "Simple execution keeps you on track.",
      metric: { name: "clean_meals", operator: ">=", target: 2, unit: "count" },
      progress: { current: 0, target: 2, pct: 0 },
      playbook: [],
    };
  }

  // Attach a short playbook from existing best next meal options (if provided)
  const opts = args.bestNextMealOptions ?? [];
  const playbook: DailyContract["playbook"] = opts.slice(0, 2).map((o, i) => ({
    id: `pb${i + 1}`,
    label: o.title,
    route: (o.kind === "home" ? "cook" : "eatout") as "cook" | "eatout" | "either",
    payload: o.payload,
  }));

  const id = `dc_${dayKey}_${userId}`;
  return {
    id,
    dayKey,
    status: "draft",
    ...contract,
    playbook,
  };
}

// Deterministic evaluation hook (v1 minimal)
export function evaluateContractProgress(args: {
  contract: DailyContract;
  // supply daily totals achieved so far (or remaining depending on your engine)
  totals: {
    protein_g?: number;
    fiber_g?: number;
    calories_over_kcal?: number; // 0 if not exceeded, positive if exceeded
    clean_meals?: number;
  };
}): DailyContract {
  const c = args.contract;
  const t = args.totals;

  let current = 0;
  if (c.metric.name === "protein_g") current = t.protein_g ?? 0;
  if (c.metric.name === "fiber_g") current = t.fiber_g ?? 0;
  if (c.metric.name === "clean_meals") current = t.clean_meals ?? 0;
  if (c.metric.name === "calories_kcal") current = t.calories_over_kcal ?? 0; // “over” amount

  const progress = {
    current,
    target: c.metric.target,
    pct: pct(current, c.metric.target),
  };

  return { ...c, progress };
}
