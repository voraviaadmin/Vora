import express from "express";
import crypto from "crypto";
import type { Db } from "../../db/connection";
import { apiErr, apiOk, requireSyncMode } from "../../middleware/resolveContext";
import multer from "multer";
import { decryptProfile } from "../profile/crypto"; // adjust path to your actual profile module
import { getSyncPreferences } from "./preferences";
import { getDbFromReq } from "../../db/connection";
// ✅ Canonical scorer (single entrypoint)
import { openAiScoreOneItem, openAiScoreManyText } from "../ai/openai-score";




const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    // Configurable; keep safe defaults. No hardcoding “magic”.
    fileSize: Number(process.env.SCAN_OCR_MAX_BYTES ?? 6_000_000),
  },
});



/*function getDb(req: any): Db | null {
  const db = req?.app?.locals?.db as Db | undefined;
  return db ?? null;
}*/

function nowIso() {
  return new Date().toISOString();
}

function expiresIso(days: number) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

function fingerprintFromItems(items: { name: string }[]) {
  const base = items
    .map((x) => String(x?.name ?? "").trim().toLowerCase())
    .filter(Boolean)
    .join("\n");
  return crypto.createHash("sha1").update(base).digest("hex");
}

// Hard retention enforcement without extra infra: purge on access
function purgeExpired(db: Db) {
  const now = nowIso();
  db.prepare(`DELETE FROM user_restaurant_menu_snapshot WHERE expiresAt < ?`).run(now);
}


function normalizeSnapshotItems(payloadItems: any[]) {
  const DEBUG = process.env.DEBUG_SYNC === "1";

  const norm = (s: string) => s.toLowerCase().trim().replace(/\s+/g, " ");

  return (payloadItems ?? [])
    .map((it: any, idx: number) => {
      const name = String(it?.name ?? "").trim();
      if (!name) return null;

      const sj = it?.scoringJson ?? null;

      // Stable itemId fallback (avoid idx)
      const itemId = String(it?.itemId ?? `nm-${norm(name).replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, "-")}`);

      const scoreValue =
        typeof sj?.score === "number"
          ? sj.score
          : typeof it?.scoreValue === "number"
          ? it.scoreValue
          : typeof it?.score?.value === "number"
          ? it.score.value
          : null;

      const scoreLabel =
        typeof sj?.label === "string"
          ? sj.label
          : typeof it?.scoreLabel === "string"
          ? it.scoreLabel
          : typeof it?.score?.label === "string"
          ? it.score.label
          : null;

      const reasons: string[] =
        Array.isArray(sj?.reasons)
          ? sj.reasons.map((r: any) => String(r ?? "").trim()).filter(Boolean)
          : Array.isArray(it?.reasons)
          ? it.reasons
              .map((r: any) => (typeof r === "string" ? r : String(r?.text ?? "")).trim())
              .filter(Boolean)
          : Array.isArray(it?.why)
          ? it.why.map((s: any) => String(s ?? "").trim()).filter(Boolean)
          : [];

      const flags: string[] = Array.isArray(sj?.flags)
        ? sj.flags.map((s: any) => String(s ?? "").trim()).filter(Boolean)
        : Array.isArray(it?.flags)
        ? it.flags.map((s: any) => String(s ?? "").trim()).filter(Boolean)
        : [];

      if (DEBUG) {
        console.log("[snapshot] normalize item", {
          name,
          hasScoringJson: !!sj,
          scoreValue,
          scoreLabel,
          reasonsCount: reasons.length,
          flagsCount: flags.length,
        });
      }

      return {
        itemId,
        name,
        scoreValue,
        scoreLabel,
        scoringJson: sj, // ✅ canonical payload persisted
        reasons: reasons.slice(0, 4),
        flags: flags.slice(0, 6),
      };
    })
    .filter(Boolean);
}


export function restaurantsRouter() {
  const router = express.Router();

  // NOTE: keeping your existing stub endpoints untouched for safety.
  function meta(req: any) {
    const mode = req?.ctx?.profileMode ?? "privacy";
    const syncMode = !!req?.ctx?.syncEnabled;
    const requestId = req?.ctx?.requestId ?? req?.id;
    return { mode, syncMode, requestId };
  }

  // GET /v1/restaurants/search?q=...
  router.get("/search", (req, res) => {
    const q = String(req.query.q ?? "").trim();
    if (!q) {
      return res.status(400).json({ meta: meta(req), error: "MISSING_QUERY" });
    }
    return res.json({ meta: meta(req), data: { results: [] } });
  });

  // POST /v1/restaurants/score-items
  router.post("/score-items", (req, res) => {
    const mode: "privacy" | "sync" = req?.ctx?.profileMode ?? "privacy";
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    if (!items.length) {
      return res.status(400).json({ meta: meta(req), error: "MISSING_ITEMS" });
    }

    const ranked = items.map((it: any) => ({
      itemId: String(it.itemId ?? ""),
      score: {
        value: mode === "sync" ? 78 : 70,
        label: mode === "sync" ? "Great" : "Good",
        kind: mode === "sync" ? "personalized" : "general",
      },
      why:
        mode === "sync"
          ? ["Personalized scoring will be enabled once profile + AI hooks are connected."]
          : ["General estimate (Private mode)."],
      confidence: mode === "sync" ? 0.7 : 0.5,
    }));

    return res.json({ meta: meta(req), data: { ranked } });
  });

  return router;
}

function safeJsonParse(txt: string) {
  const s = String(txt ?? "").trim();

  // Strip ```json fences if present
  const stripped = s
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();

  return JSON.parse(stripped);
}


function clamp01(x: any) {
  const n = typeof x === "number" ? x : Number(x);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function clampScore(x: any) {
  const n = typeof x === "number" ? x : Number(x);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

export function syncEatOutRouter() {
  const router = express.Router();


  router.get("/restaurants/nearby", requireSyncMode(), async (req, res) => {
    try {
      const apiKey = String(process.env.GOOGLE_PLACES_API_KEY ?? "").trim();
      if (!apiKey) {
        const r = apiErr(req, "MISSING_GOOGLE_API_KEY", "Nearby search is not configured.", "Try again later.", 500, false);
        return res.status(r.status).json(r.body);
      }
  
      const lat = Number(req.query.lat);
      const lng = Number(req.query.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        const r = apiErr(req, "MISSING_LOCATION", "Missing location.", "Enable location and try again.", 400, true);
        return res.status(r.status).json(r.body);
      }
  
      const radiusMeters = Number(req.query.radius_meters ?? process.env.EATOUT_PLACES_RADIUS_METERS ?? 8000);
      const cuisinesRaw = String(req.query.cuisines ?? "").trim(); // comma-separated
      const q = String(req.query.q ?? "").trim();
  
      const prefs = getSyncPreferences(req);
      const cuisines = cuisinesRaw
        ? cuisinesRaw.split(",").map(s => s.trim()).filter(Boolean)
        : Array.isArray(prefs?.cuisines) ? prefs.cuisines : [];
  
      // Phase 1 query policy: user-triggered only, flexible text search
      const query = q || (cuisines.length ? cuisines.slice(0, 5).join(" OR ") : "restaurants");
  
      const resp = await fetch("https://places.googleapis.com/v1/places:searchText", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask": [
            "places.id",
            "places.displayName",
            "places.formattedAddress",
            "places.rating",
            "places.priceLevel",
            "places.primaryType",
            "places.types",
          ].join(","),
        },
        body: JSON.stringify({
          textQuery: query,
          locationBias: {
            circle: {
              center: { latitude: lat, longitude: lng },
              radius: Math.max(1000, Math.min(50000, Number(radiusMeters) || 8000)),
            },
          },
          includedType: "restaurant",
          maxResultCount: 20,
        }),
      });
  
      if (!resp.ok) {
        const txt = await resp.text().catch(() => "");
        console.error("PLACES_FAIL_NEARBY", resp.status, txt.slice(0, 250));
        const r = apiErr(req, "PLACES_FAILED", "Nearby search failed.", "Try again.", 502, true);
        return res.status(r.status).json({ ...r.body, debug: { status: resp.status, body: txt.slice(0, 300) } });
      }
  
      const json = await resp.json();
      const places = Array.isArray(json?.places) ? json.places : [];
  
      const results = places
        .map((p: any) => ({
          placeRefId: String(p?.id ?? "").trim(),
          name: String(p?.displayName?.text ?? p?.displayName ?? "").trim() || "Unknown",
          addressShort: String(p?.formattedAddress ?? "").trim() || null,
          rating: typeof p?.rating === "number" ? p.rating : null,
          priceLevel: typeof p?.priceLevel === "number" ? p.priceLevel : null,
          primaryType: String(p?.primaryType ?? "").trim() || null,
          types: Array.isArray(p?.types) ? p.types : [],
        }))
        .filter((x: any) => !!x.placeRefId);
  
      return res.json(apiOk(req, { results }));
    } catch {
      const r = apiErr(req, "NEARBY_FAILED", "We couldn’t search restaurants.", "Try again.", 500, true);
      return res.status(r.status).json(r.body);
    }
  });
  

  // Phase 1: ingest (existing)
  router.post("/menu/ingest", requireSyncMode(), (req, res) => {
    const menu_url = typeof req.body?.menu_url === "string" ? req.body.menu_url.trim() : "";
    const menu_text = typeof req.body?.menu_text === "string" ? req.body.menu_text.trim() : "";
    const upload_id = typeof req.body?.upload_id === "string" ? req.body.upload_id.trim() : "";
    const items = Array.isArray(req.body?.items) ? req.body.items : [];

    if (!menu_url && !menu_text && !upload_id && !items.length) {
      const r = apiErr(
        req,
        "MISSING_MENU_INPUT",
        "Provide a menu URL, menu text, upload_id, or menu items.",
        "Paste a URL or upload a menu.",
        400,
        true
      );
      return res.status(r.status).json(r.body);
    }

    const normalizedItems = items.map((it: any, idx: number) => ({
      itemId: String(it.itemId ?? `item-${idx}`),
      name: String(it.name ?? "").trim(),
      description: String(it.description ?? "").trim(),
      price: it.price ?? null,
    }));

    const normalized = {
      source: menu_url ? "url" : upload_id ? "upload" : menu_text ? "text" : "items",
      menuUrl: menu_url || null,
      uploadId: upload_id || null,
      items: normalizedItems,
      parseConfidence: normalizedItems.length ? 0.85 : 0.5,
      notes: normalizedItems.length
        ? ["Menu items accepted as-is."]
        : ["Menu parsing provider not wired yet (Phase 1). Provide items[] for now or wire URL/upload parsing next."],
    };

    return res.json(apiOk(req, { normalized }));
  });

  // Phase 1: score (existing)
 /**
   * ✅ NEW: /menu/score returns scoringJson per item (canonical contract)
   * - No inline OpenAI calls here
   * - No API key passed from router
   * - Router only maps inputs and returns outputs
   */
 router.post(
  "/menu/score",
  requireSyncMode(),
  upload.fields([{ name: "file", maxCount: 1 }, { name: "image", maxCount: 1 }]),
  async (req, res) => {
    try {
      const prefs = getSyncPreferences(req);

      const files = req.files as any;
      const f = files?.file?.[0] ?? files?.image?.[0];

      const bodyItems = Array.isArray(req.body?.items) ? req.body.items : [];
      const items = bodyItems
        .map((it: any) => ({
          itemId: String(it?.itemId ?? ""),
          name: String(it?.name ?? "").trim(),
          ingredients: String(it?.description ?? it?.ingredients ?? "").trim() || null,
        }))
        .filter((x: any) => !!x.name)
        .slice(0, 50);

      // NOTE: Current canonical contract does not include confidence.
      // We keep fallbackRecommended simple: only when AI fails or no items.
      let ranked: any[] = [];

      if (f?.buffer) {
        // Vision path: score ONE best-effort item (or later: extract items in separate parsing step)
        const mime = String(f.mimetype ?? "").toLowerCase();
        const allowed = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);
        if (!allowed.has(mime)) {
          const r = apiErr(req, "UNSUPPORTED_MEDIA", "Menu scan requires an image.", "Upload JPG/PNG/WebP.", 415, true);
          return res.status(r.status).json(r.body);
        }

        // For now, use OCR/extraction phase separately; vision scoring here is “single item”.
        // If you want multi-item extraction from a menu image, that becomes a separate extractor step.
        const scoringJson = await openAiScoreOneItem({
          source: "menu",
          mode: "vision",
          imageBuffer: f.buffer,
          mime,
          detectedText: null,
          userPreferences: prefs,
        });

        ranked = [
          {
            itemId: "item-0",
            name: "Menu item (from image)",
            score: { value: scoringJson.score, label: scoringJson.label, kind: "personalized" },
            scoringJson,
          },
        ];
      } else {
        if (!items.length) {
          const r = apiErr(req, "MISSING_ITEMS", "No menu items provided.", "Scan the menu or select items manually.", 400, true);
          return res.status(r.status).json(r.body);
        }

        const scored = await openAiScoreManyText({
          source: "menu",
          items: items.map((x: any) => ({ name: x.name, ingredients: x.ingredients })),
          userPreferences: prefs,
        });

        ranked = scored.map((x, idx) => ({
          itemId: items[idx]?.itemId || `item-${idx}`,
          name: x.name,
          score: { value: x.scoringJson.score, label: x.scoringJson.label, kind: "personalized" },
          scoringJson: x.scoringJson,
        }));
      }

      return res.json(
        apiOk(req, {
          ranked,
          overallConfidence: null,
          fallbackRecommended: ranked.length === 0,
          fallbackReason: ranked.length === 0 ? "NO_ITEMS_SCORED" : null,
          extracted: { rawLines: [], notes: [] },
        })
      );
    } catch (e: any) {
      const r = apiErr(req, "MENU_SCORE_FAILED", "We couldn’t score this menu.", "Try Manual Select.", 502, true);
      return res.status(r.status).json({
        ...r.body,
        data: {
          ranked: [],
          overallConfidence: null,
          fallbackRecommended: true,
          fallbackReason: e?.message ?? "AI_PROVIDER_FAILED",
        },
      });
    }
  }
);
  
  

  /**
   * Snapshot endpoints (Overwrite + 30-day retention)
   *
   * Mounted under /v1/sync/eatout, so full paths are:
   * - PUT  /v1/sync/eatout/restaurants/:placeRefId/menu/snapshot
   * - GET  /v1/sync/eatout/restaurants/:placeRefId/menu/snapshot
   * - GET  /v1/sync/eatout/restaurants/snapshots/status?ids=a,b,c
   */

  // Fast status for restaurant list UI
  router.get("/restaurants/snapshots/status", requireSyncMode(), (req, res) => {
    const db = getDbFromReq(req);
    if (!db) {
      const r = apiErr(req, "DB_NOT_AVAILABLE", "Database not available.", "Restart backend.", 500, false);
      return res.status(r.status).json(r.body);
    }

    purgeExpired(db);

    const idsRaw = String(req.query.ids ?? "").trim();
    const ids = idsRaw ? idsRaw.split(",").map((s) => s.trim()).filter(Boolean) : [];
    if (!ids.length) {
      const r = apiErr(req, "MISSING_IDS", "No restaurant ids provided.", "Provide ids query parameter.", 400, true);
      return res.status(r.status).json(r.body);
    }

    const userId = String(
      req?.ctx?.userId ?? req.header("x-user-id") ?? ""
    ).trim();
    


    if (!userId) {
      const r = apiErr(req, "UNAUTHENTICATED", "Missing user.", "Sign in again.", 401, false);
      return res.status(r.status).json(r.body);
    }

    const stmt = db.prepare(`
      SELECT placeRefId, updatedAt, expiresAt
      FROM user_restaurant_menu_snapshot
      WHERE userId = ? AND placeRefId IN (${ids.map(() => "?").join(",")})
    `);

    const rows = stmt.all(userId, ...ids);

    const map = new Map(rows.map((r: any) => [r.placeRefId, r]));
    const status = ids.map((placeRefId) => {
      const row = map.get(placeRefId);
      return {
        placeRefId,
        hasSnapshot: !!row,
        updatedAt: (row as any)?.updatedAt ?? null,
        expiresAt: (row as any)?.expiresAt ?? null,
      };
    });

    return res.json(apiOk(req, { status }));
  });

  // View snapshot (no AI call)
  router.get("/restaurants/:placeRefId/menu/snapshot", requireSyncMode(), (req, res) => {
    const db = getDbFromReq(req);
    if (!db) {
      const r = apiErr(req, "DB_NOT_AVAILABLE", "Database not available.", "Restart backend.", 500, false);
      return res.status(r.status).json(r.body);
    }

    purgeExpired(db);

    const userId = String(
      req?.ctx?.userId ?? req.header("x-user-id") ?? ""
    ).trim();
    


    if (!userId) {
      const r = apiErr(req, "UNAUTHENTICATED", "Missing user.", "Sign in again.", 401, false);
      return res.status(r.status).json(r.body);
    }

    const placeRefId = String(req.params.placeRefId ?? "").trim();
    if (!placeRefId) {
      const r = apiErr(req, "MISSING_PLACE_REF", "Missing restaurant id.", "Pick a restaurant again.", 400, true);
      return res.status(r.status).json(r.body);
    }

    const row = db
      .prepare(
        `SELECT userId, placeRefId, updatedAt, expiresAt, menuSource, menuFingerprint, confidence, itemsJson
         FROM user_restaurant_menu_snapshot
         WHERE userId = ? AND placeRefId = ?`
      )
      .get(userId, placeRefId) as any;

    if (!row) {
      const r = apiErr(req, "NO_SNAPSHOT", "No saved menu found for this restaurant.", "Scan the menu to score it.", 404, true);
      return res.status(r.status).json(r.body);
    }

    let items = [];
    try {
      items = JSON.parse(row.itemsJson);
    } catch {
      items = [];
    }

    return res.json(
      apiOk(req, {
        snapshot: {
          placeRefId: row.placeRefId,
          updatedAt: row.updatedAt,
          expiresAt: row.expiresAt,
          menuSource: row.menuSource,
          menuFingerprint: row.menuFingerprint,
          confidence: row.confidence,
          items,
        },
      })
    );
  });



  const upsertSnapshotHandler = (req: any, res: any) => {
    const db = getDbFromReq(req);
    if (!db) {
      const r = apiErr(req, "DB_NOT_AVAILABLE", "Database not available.", "Restart backend.", 500, false);
      return res.status(r.status).json(r.body);
    }
  
      purgeExpired(db);
  
      const userId = String(
        req?.ctx?.userId ?? req.header("x-user-id") ?? ""
      ).trim();
  
      
      if (!userId) {
        const r = apiErr(req, "UNAUTHENTICATED", "Missing user.", "Sign in again.", 401, false);
        return res.status(r.status).json(r.body);
      }
  
      const placeRefId = String(req.params.placeRefId ?? "").trim();
      if (!placeRefId) {
        const r = apiErr(req, "MISSING_PLACE_REF", "Missing restaurant id.", "Pick a restaurant again.", 400, true);
        return res.status(r.status).json(r.body);
      }
  
      // Accept either explicit items[] or ranked[] from menu/score response
      const rawItems = Array.isArray(req.body?.items)
        ? req.body.items
        : Array.isArray(req.body?.ranked)
        ? req.body.ranked
        : Array.isArray(req.body?.data?.ranked)
        ? req.body.data.ranked
        : [];
  
      const items = normalizeSnapshotItems(rawItems);
      if (!items.length) {
        const r = apiErr(req, "MISSING_ITEMS", "No menu items to save.", "Score a menu first, then save.", 400, true);
        return res.status(r.status).json(r.body);
      }
  
      const menuSource = String(req.body?.menuSource ?? req.body?.source ?? "scan_upload").trim() || "scan_upload";
      const confidence =
        typeof req.body?.confidence === "number"
          ? req.body.confidence
          : typeof req.body?.ai?.confidence === "number"
          ? req.body.ai.confidence
          : 0.7;
  
          const menuFingerprint =
          String(
            req.body?.menuFingerprint ??
              fingerprintFromItems(items.filter((i: any) => !!i && typeof i.name === "string" && i.name !== "").map((i: any) => ({ name: i.name })))
          ).trim();
  
          
  
  
      const updatedAt = nowIso();
      const expiresAt = expiresIso(30);
  
      db.prepare(
        `INSERT INTO user_restaurant_menu_snapshot
         (userId, placeRefId, updatedAt, expiresAt, menuSource, menuFingerprint, confidence, itemsJson)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(userId, placeRefId) DO UPDATE SET
           updatedAt = excluded.updatedAt,
           expiresAt = excluded.expiresAt,
           menuSource = excluded.menuSource,
           menuFingerprint = excluded.menuFingerprint,
           confidence = excluded.confidence,
           itemsJson = excluded.itemsJson`
      ).run(userId, placeRefId, updatedAt, expiresAt, menuSource, menuFingerprint, confidence, JSON.stringify(items));
  
      return res.json(
        apiOk(req, {
          snapshot: {
            placeRefId,
            updatedAt,
            expiresAt,
            menuSource,
            menuFingerprint,
            confidence,
            itemCount: items.length,
          },
        })
      );
    }
  
  router.put("/restaurants/:placeRefId/menu/snapshot", requireSyncMode(), upsertSnapshotHandler);
  router.post("/restaurants/:placeRefId/menu/snapshot", requireSyncMode(), upsertSnapshotHandler);
  

  return router;
}
