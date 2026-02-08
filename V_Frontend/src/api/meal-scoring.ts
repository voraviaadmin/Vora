// src/api/meal-scoring.ts
import { apiJson, apiPost, apiPostForm } from "./client";
import type { MealInput } from "../contracts/meal-input";

export type AppMode = "privacy" | "sync";
export type ModeOpts = { mode: AppMode };




export type ScoreContextV1 = "food_scan" | "menu_scan" | "eatout_menu";

export type ScoreRequestV1 = {
  context: ScoreContextV1;
  input: {
    text?: string;
    menuItems?: Array<{ name: string; description?: string }>;
  };
};

export type ScoreResponseV1 = {
  scoring: {
    score: number;
    label?: string;
    reasons: string[];
  };
};

export async function scoreV1(req: ScoreRequestV1, opts: ModeOpts) {
  if (opts.mode === "sync") {
    // Sync-only: OpenAI authoritative (backend enriches with profile/goals/cuisines)
    return apiPost<ScoreResponseV1>("/v1/sync/scan/score-v1", req);
  }

  // Privacy-only: deterministic scoring via profile router
  // We convert to MealInput shape minimally to keep old system stable.
  const input: any = {
    capturedAt: new Date().toISOString(),
    itemsText: req.input.text ?? "",
  };
  return scoreMealInputPreview(input, opts) as any;
}



// ------------------------------
// Existing: meal preview + logs
// ------------------------------
export type ScoreMealInputResponse = {
  scoring: {
    score: number;
    reasons: string[]; // keep it simple for 0-patience UX
    confidence?: number;
  };
};

export type CreateLogRequest = {
  summary?: string | null;
  capturedAt?: string | null;
  mealType?: string | null;

  // optional / future
  groupId?: string | null;
  placeRefId?: string | null;
};

export type CreateLogResponse = {
  ok: true;
  logId: string;
};

export async function createMealLog(req: CreateLogRequest, opts: ModeOpts) {
  const mode = opts.mode;
  if (mode !== "sync") {
    return { ok: false, blocked: true, mode };
  }
  return apiPost<CreateLogResponse>("/v1/logs", req);
}

export async function scoreMealInputPreview(input: MealInput, opts: ModeOpts) {
  // In privacy mode you may already have a stub endpoint. Keep existing behavior.
  return apiPost<ScoreMealInputResponse>("/v1/profile/score-input-preview", { input });
}

export async function scanOcr(
  file: { uri: string; name: string; type: string },
  opts: ModeOpts
) {
  // Your backend enforces privacy allowlist. Keep call centralized.
  // IMPORTANT: In privacy mode backend may block cloud OCR → caller must handle meta.blocked.
  const form = new FormData();
  form.append("file", file as unknown as Blob);
  return apiPostForm<any>("/v1/scan/ocr", form, {});
}

// ------------------------------
// NEW: Eat Out Sync APIs
// ------------------------------

export type EatOutNormalizedItem = {
  itemId: string;
  name: string;
  description?: string;
  price?: any;
};

export type EatOutIngestResponse = {
  meta: { mode: AppMode; syncMode: boolean; requestId?: string };
  data: {
    normalized: {
      source: "url" | "text" | "upload" | "items";
      menuUrl: string | null;
      uploadId: string | null;
      items: EatOutNormalizedItem[];
      parseConfidence: number;
      notes: string[];
    };
  };
};

export type EatOutScoreResponse = {
  meta: { mode: AppMode; syncMode: boolean; requestId?: string };
  data: {
    ranked: Array<{
      itemId: string;
      name: string;
      score: { value: number; label: string; kind: "personalized" };
      confidence: number;
      why: string[];
      safeFallback: { shown: boolean; reason: string | null };
    }>;
    overallConfidence?: number;
    fallbackRecommended?: boolean;
    fallbackReason?: string | null;
    extracted?: { rawLines?: string[]; notes?: string[] };
  };
};


export async function syncEatOutMenuIngest(
  input: { menu_url?: string; menu_text?: string; upload_id?: string; items?: EatOutNormalizedItem[] },
  opts: ModeOpts
): Promise<EatOutIngestResponse> {
  if (opts.mode !== "sync") {
    throw new Error("MODE_BLOCKED");
  }
  return apiPost<EatOutIngestResponse>("/v1/sync/eatout/menu/ingest", input);
}

export async function syncEatOutMenuScore(
  input: { items: EatOutNormalizedItem[] },
  opts: ModeOpts
): Promise<EatOutScoreResponse> {
  if (opts.mode !== "sync") {
    throw new Error("MODE_BLOCKED");
  }
  return apiPost<EatOutScoreResponse>("/v1/sync/eatout/menu/score", input);
}



export type NearbyRestaurant = {
  placeRefId: string;
  name: string;
  addressShort?: string | null;
  rating?: number | null;
  priceLevel?: number | null;
  primaryType?: string | null;
  types?: string[];
};

export type NearbyRestaurantsResponse = {
  meta: { mode: AppMode; syncMode: boolean; requestId?: string };
  data: { results: NearbyRestaurant[] };
};

export async function syncEatOutRestaurantsNearby(
  input: { lat: number; lng: number; q?: string; cuisines?: string[]; radiusMeters?: number },
  opts: ModeOpts
) {
  if (opts.mode !== "sync") throw new Error("MODE_BLOCKED");

  const params = new URLSearchParams();
  params.set("lat", String(input.lat));
  params.set("lng", String(input.lng));
  if (input.q) params.set("q", input.q);
  if (input.radiusMeters) params.set("radius_meters", String(input.radiusMeters));
  if (input.cuisines?.length) params.set("cuisines", input.cuisines.join(","));

  return apiJson<NearbyRestaurantsResponse>(`/v1/sync/eatout/restaurants/nearby?${params.toString()}`);
}

export async function syncEatOutMenuScoreVision(
  file: { uri: string; name: string; type: string },
  opts: ModeOpts
): Promise<EatOutScoreResponse> {
  if (opts.mode !== "sync") throw new Error("MODE_BLOCKED");

  const form = new FormData();
  form.append("file", file as unknown as Blob);
  return apiPostForm<EatOutScoreResponse>("/v1/sync/eatout/menu/score", form, {});
}


// ------------------------------
// NEW: Menu snapshot (Overwrite + View + Status)
// ------------------------------

export type MenuSnapshotItem = {
  itemId: string;
  name: string;
  scoreValue: number | null;
  scoreLabel: string | null;
  reasons: string[];
  flags: string[];
};

export type MenuSnapshot = {
  placeRefId: string;
  updatedAt: string;
  expiresAt: string;
  menuSource: string;
  menuFingerprint: string;
  confidence: number;
  items: MenuSnapshotItem[];
  extracted?: ExtractedPayload;
};

export type SnapshotStatusResponse = {
  meta: { mode: AppMode; syncMode: boolean; requestId?: string };
  data: {
    status: Array<{
      placeRefId: string;
      hasSnapshot: boolean;
      updatedAt: string | null;
      expiresAt: string | null;
    }>;
  };
};

export async function syncEatOutSnapshotStatus(placeRefIds: string[], opts: ModeOpts) {
  if (opts.mode !== "sync") {
    throw new Error("MODE_BLOCKED");
  }
  const ids = placeRefIds.map((s) => s.trim()).filter(Boolean).join(",");
  return apiJson<SnapshotStatusResponse>(`/v1/sync/eatout/restaurants/snapshots/status?ids=${encodeURIComponent(ids)}`);
}

export type GetSnapshotResponse = {
  meta: { mode: AppMode; syncMode: boolean; requestId?: string };
  data: { snapshot: MenuSnapshot };
};

export async function syncEatOutGetSnapshot(placeRefId: string, opts: ModeOpts) {
  if (opts.mode !== "sync") {
    throw new Error("MODE_BLOCKED");
  }
  return apiJson<GetSnapshotResponse>(`/v1/sync/eatout/restaurants/${encodeURIComponent(placeRefId)}/menu/snapshot`);
}

export type PutSnapshotResponse = {
  meta: { mode: AppMode; syncMode: boolean; requestId?: string };
  data: {
    snapshot: {
      placeRefId: string;
      updatedAt: string;
      expiresAt: string;
      menuSource: string;
      menuFingerprint: string;
      confidence: number;
      itemCount: number;
    };
  };
};

export async function syncEatOutPutSnapshot(
  placeRefId: string,
  body: {
    menuSource: string;
    confidence: number;
    items: Array<{
      itemId?: string;
      name: string;
      scoreValue?: number;
      scoreLabel?: string;
      reasons?: string[];
      flags?: string[];
    }>;
  },
  opts: ModeOpts
) {
  if (opts.mode !== "sync") {
    throw new Error("MODE_BLOCKED");
  }
  return apiPost<PutSnapshotResponse>(
    `/v1/sync/eatout/restaurants/${encodeURIComponent(placeRefId)}/menu/snapshot`,
    body
  );
}



export type ExtractedPayload = {
  rawLines?: string[];
};

export type PutSnapshotBody = {
  menuSource?: string;
  confidence?: number;
  items: any[]; // whatever your current item type is
  extracted?: ExtractedPayload;   // ✅ ADD THIS
};
