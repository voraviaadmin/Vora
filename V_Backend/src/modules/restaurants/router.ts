import express from "express";
import crypto from "crypto";
import type { Db } from "../../db/connection";
import { apiErr, apiOk, requireSyncMode } from "../../middleware/resolveContext";

function getDb(req: any): Db | null {
  const db = req?.app?.locals?.db as Db | undefined;
  return db ?? null;
}

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

// Extract a safe, storage-ready item list (NO raw OCR)
function normalizeSnapshotItems(payloadItems: any[]) {
  return payloadItems
    .map((it: any, idx: number) => {
      const name = String(it?.name ?? "").trim();
      if (!name) return null;

      const itemId = String(it?.itemId ?? `item-${idx}`);

      // Support both shapes:
      // - ranked[] from /menu/score: { name, score: {value,label}, why[] }
      // - normalized[]: { name, ... }
      const scoreValue =
        typeof it?.scoreValue === "number"
          ? it.scoreValue
          : typeof it?.score?.value === "number"
          ? it.score.value
          : null;

      const scoreLabel =
        typeof it?.scoreLabel === "string"
          ? it.scoreLabel
          : typeof it?.score?.label === "string"
          ? it.score.label
          : null;

      const reasons: string[] =
        Array.isArray(it?.reasons)
          ? it.reasons.map((r: any) => (typeof r === "string" ? r : String(r?.text ?? "")).trim()).filter(Boolean)
          : Array.isArray(it?.why)
          ? it.why.map((s: any) => String(s ?? "").trim()).filter(Boolean)
          : [];

      const flags: string[] = Array.isArray(it?.flags)
        ? it.flags.map((s: any) => String(s ?? "").trim()).filter(Boolean)
        : [];

      return {
        itemId,
        name,
        scoreValue,
        scoreLabel,
        reasons: reasons.slice(0, 4), // keep short
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

export function syncEatOutRouter() {
  const router = express.Router();

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
  router.post("/menu/score", requireSyncMode(), (req, res) => {
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    if (!items.length) {
      const r = apiErr(req, "MISSING_ITEMS", "No menu items provided to score.", "Ingest a menu first or provide items[].", 400, true);
      return res.status(r.status).json(r.body);
    }

    const ranked = items.map((it: any, idx: number) => ({
      itemId: String(it.itemId ?? `item-${idx}`),
      name: String(it.name ?? "").trim(),
      score: { value: 75, label: "Good", kind: "personalized" },
      confidence: 0.7,
      why: ["Personalized ranking stub (AI provider wiring next)."],
      safeFallback: { shown: false, reason: null },
    }));

    return res.json(apiOk(req, { ranked }));
  });

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
    const db = getDb(req);
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
        updatedAt: row?.updatedAt ?? null,
        expiresAt: row?.expiresAt ?? null,
      };
    });

    return res.json(apiOk(req, { status }));
  });

  // View snapshot (no AI call)
  router.get("/restaurants/:placeRefId/menu/snapshot", requireSyncMode(), (req, res) => {
    const db = getDb(req);
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
    const db = getDb(req);
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
