// src/api/home.ts
import { apiGet } from "../../lib/api";

export type HomeWindow = "daily" | "3d" | "7d" | "14d";

export type HomeSummaryResponse = {
  meta: {
    window: HomeWindow;
    generatedAt: string;
    syncMode: "privacy" | "sync" | "private"; // backend currently returns "privacy"
    mode: "individual" | "family" | string; // tolerate server changes
    subjectMemberId?: string;
  };

  header: {
    title: string;
    subtitle: string | null;
    modeLabel: string;
    streakDays: number;
  };

  heroScore: {
    value: number; // 0..100
    label: string; // "Daily Score" / "7-day Avg"
    resetsText: string; // "Resets nightly"
    statusWord: string; // "Good"
    description: string; // calm guidance
    confidence?: number | null;
  };

  actions: {
    primaryCta: { id: string; title: string; subtitle: string | null };
    secondaryCta: { id: string; title: string; subtitle: string | null };
  };

  todaysFocus:
  | {
    title: string;
    chips: Array<{ key: string; label: string; valueText: string }>;
    totals?: Record<string, number> | null;
  }
  | null;

  suggestion:
  | {
    title: string;
    suggestionText: string;
    contextNote?: string | null;

    // ✅ add these (used by adaptive UI)
    confidence?: number | null; // 0..1
    confidenceLabel?: "low" | "medium" | "high" | string | null;

    // ✅ used for eat-out routing/search
    route?: {
      searchKey?: string | null;
    } | null;

    // ✅ used for idea cards
    dishIdeas?: Array<{
      title: string;
      query?: string | null;
      tags?: string[] | null;
    }> | null;

    // keep existing
    restaurantQuery?: { cuisine?: string | null; tags?: string[] | null } | null;
  }
  | null;

  // ✅ NEW: return intent + dish options (used by adaptive UI)
  bestNextMeal?: {
    intent: BestNextMealIntent;
    options: DishOption[];
    insightsCollapsed?: string[]; // 0–2
  } | null;

  recentLogs: {
    items: Array<{
      logId: string;
      capturedAt: string | null;
      summary: string | null;
      mealType: string | null;
      score: number | null;
    }>;
  };
};

function encode(params: Record<string, string | number | undefined | null>) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    sp.set(k, String(v));
  }
  const qs = sp.toString();
  return qs ? `?${qs}` : "";
}

/**
 * Home summary (member-scoped server-side via req.ctx.activeMemberId).
 * Keep Home UI thin: it consumes this UI-ready payload and does no aggregation.
 */
export async function getHomeSummary(window: HomeWindow = "daily", limit: number = 5) {
  return await apiGet<HomeSummaryResponse>(
    `/v1/home/summary${encode({ window, limit })}`
  );
}


export type BestNextMealIntent = {
  intentId: string;
  version: "v1";
  mealSlot: "breakfast" | "lunch" | "dinner" | "snack" | "unknown";
  validUntilISO: string;
  confidence: { score: number; tier: "high" | "medium" | "low"; rationale?: string[] };
  tags?: string[]; // “protein-forward”, “low added sugar”, etc
  cuisineBias?: { top?: string[] };
};

export type DishOption = {
  optionId: string;
  kind: "eatout" | "home";
  title: string;
  why?: string[]; // 0–2
  route: { type: "restaurant_search"; searchKey: string } | { type: "cook_plan" };
};