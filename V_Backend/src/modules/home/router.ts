import { Router } from "express";
import { getHomeSummary } from "./service";
import { getCtx, getDb } from "../logs/service";
import { getDailyContract, updateDailyContractStatus, updateDailyContractAdjustments } from "./contracts.store";
import { rowToApi } from "./contracts.map";
import { startOfLocalDayIso } from "./service"; 
import { isSyncEnabled } from "./service";


type HomeWindow = "daily" | "3d" | "7d" | "14d";

function normalizeWindow(raw: any): HomeWindow {
  const v = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (v === "daily" || v === "3d" || v === "7d" || v === "14d") return v;
  return "daily";
}

function parseLimit(raw: any) {
  if (raw == null) return 5;
  const n = Number(raw);
  if (!Number.isFinite(n)) throw new Error("INVALID_LIMIT");
  const i = Math.trunc(n);
  if (i <= 0) throw new Error("INVALID_LIMIT");
  return Math.min(i, 20);
}

export function homeRouter() {
  const r = Router();

  // GET /v1/home/summary?window=daily|3d|7d|14d&limit=5
  r.get("/summary", async (req, res, next) => {
    try {
      const window = normalizeWindow(req.query.window);
      const limit = parseLimit(req.query.limit);
  
      //console.log("[HOME] req", req.method, req.originalUrl);

      const out = await getHomeSummary(req, { window, limit });
      res.json(out);
    } catch (err) {
      next(err);
    }
  });
  

  r.post("/daily-contract/accept", (req, res) => {
    const ctx = getCtx(req);
    const db = getDb(req);
  
    const now = new Date();
    const nowIso = now.toISOString();
    const dayKey = startOfLocalDayIso(now).slice(0, 10);
  
    const subjectMemberId = ctx.activeMemberId;
    const syncOn = isSyncEnabled(db, ctx.userId);
    const syncMode: "sync" | "privacy" = syncOn ? "sync" : "privacy";
  
    const row = getDailyContract(db, { userId: ctx.userId, subjectMemberId, dayKey, syncMode });
    if (!row) return res.status(404).json({ error: "NO_CONTRACT" });
  
    updateDailyContractStatus(db, {
      id: row.id,
      status: "active",
      acceptedAt: nowIso,
      nowIso,
    });
  
    const updated = getDailyContract(db, { userId: ctx.userId, subjectMemberId, dayKey, syncMode });
    return res.json({ ok: true, dailyContract: updated ? rowToApi(updated) : null });
  });


  r.post("/daily-contract/adjust", (req, res) => {
    const ctx = getCtx(req);
    const db = getDb(req);
  
    const now = new Date();
    const nowIso = now.toISOString();
    const dayKey = startOfLocalDayIso(now).slice(0, 10);
  
    const subjectMemberId = ctx.activeMemberId;
    const syncOn = isSyncEnabled(db, ctx.userId);
    const syncMode: "sync" | "privacy" = syncOn ? "sync" : "privacy";
  
    const { targetDeltaPct, lockCuisine, swapMetric } = req.body ?? {};
  
    const row = getDailyContract(db, { userId: ctx.userId, subjectMemberId, dayKey, syncMode });
    if (!row) return res.status(404).json({ error: "NO_CONTRACT" });
  
    // bounded: +/-20%
    const base = row.metricTarget;
    const pct = typeof targetDeltaPct === "number" ? Math.max(-0.2, Math.min(0.2, targetDeltaPct)) : 0;
    const adjustedTarget = pct !== 0 ? Math.round(base * (1 + pct)) : null;

    updateDailyContractAdjustments(db, {
      id: row.id,
      adjustedTarget,
      lockCuisine: typeof lockCuisine === "string" ? lockCuisine : null,
      swappedMetric: typeof swapMetric === "boolean" ? (swapMetric ? 1 : 0) : undefined,
      nowIso,
    });
  
    const updated = getDailyContract(db, { userId: ctx.userId, subjectMemberId, dayKey, syncMode });
    return res.json({ ok: true, dailyContract: updated ? rowToApi(updated) : null });
  });



  return r;
}
