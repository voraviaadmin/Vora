import { Router } from "express";
import {
  listLogs,
  createLog,
  deleteLog,
  createLogServerSide,
  getCtx,
  getDb,
} from "./service";
import { buildMealContext } from "../profile/mealContext";
import { scoreMealContext } from "../../utils/scoring";
import { apiErr, apiOk, requireSyncMode } from "../../middleware/resolveContext";



export function logsRouter() {
  const r = Router();

  // List logs (defaults to activeMemberId; optional memberId if allowed)
  r.get("/", (req, res) => {
    const out = listLogs(req, req.query);
    res.json(out);
  });

  // Create log for activeMemberId ONLY
  r.post("/", requireSyncMode(), (req, res) => {
    const out = createLog(req, req.body);
    res.json(out);
  });


// POST /v1/logs/from-input
// body: { input: MealInput, summary?: string|null, capturedAt?: string|null }
/*r.post("/from-input", async (req, res) => {
  const ctx = getCtx(req);
  const db = getDb(req);

  const body = req.body as any;
  const input = body?.input;

  if (!input || typeof input !== "object") {
    return res.status(400).json({ error: "INVALID_INPUT" });
  }
  if (typeof input.capturedAt !== "string") {
    return res.status(400).json({ error: "INVALID_CAPTURED_AT" });
  }

  // IMPORTANT: capturedAt defines scoring time (deterministic)
  const nowIso = new Date(input.capturedAt).toISOString();

  // 1) Build meal context (reuse your existing pipeline)
  const mealCtx = buildMealContext(
    req,
    { trendDays: undefined, recentLimit: undefined },
    { nowIso, mealTypeHint: input.mealTypeHint ?? null, mealInput: input }
  );

  // 2) Compute deterministic baseline score
  const scoring = scoreMealContext(mealCtx);

  // 3) Determine sync mode (to decide if we persist scoringJson)
  const settings = db
    .prepare("SELECT mode FROM profile_settings WHERE userId=?")
    .get(ctx.userId);

  const mode = settings?.mode === "sync" ? "sync" : "privacy";

  // 4) Create the log (server-owned fields)
  const summary = (body?.summary ?? input.itemsText ?? "").toString().slice(0, 2000) || null;
  const mealType = mealCtx.mealType ?? null;

  // scoringJson only when sync is enabled
  const scoringJson = mode === "sync" ? JSON.stringify(scoring) : null;

  const created = createLogServerSide({
    ctx,
    db,
    summary,
    capturedAt: nowIso,
    mealType,
    score: scoring.score,
    scoringJson,
  });

  // 5) Audit (keep your existing pattern)
  // auditEvent(db, { type: "LOG_CREATE", ... })

  return res.json({ log: created });
});*/

  // Delete log (only if log belongs to allowed member)
  r.delete("/:logId", requireSyncMode(), (req, res) => {
    const out = deleteLog(req, req.params.logId);
    res.json(out);
  });

  return r;
}
