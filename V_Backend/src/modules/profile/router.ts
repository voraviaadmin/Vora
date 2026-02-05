import { Router } from "express";
import {
  getProfile,
  enableSync,
  disableSync,
  saveProfile,
  getProfilePreferences,
  saveProfilePreferences,
} from "./service";
import { queryInt } from "../../config/runtime";
import { buildMealContext } from "./mealContext";
import { scoreMealContext } from "../../utils/scoring";
import { fetchTrendLogs, computeTrendFromLogs } from "../../utils/trends";  
import { envInt } from "../../config/runtime";



export function profileRouter() {
  const r = Router();

  r.get("/", (req, res) => res.json(getProfile(req)));

    // Opt-in to server-side storage + cross-device sync
    r.post("/enable-sync", (req, res) => {
      const out = enableSync(req);
      res.json(out);
    });
  
    // Opt-out + hard-delete server-side profile payload
    r.post("/disable-sync", (req, res) => {
      const out = disableSync(req);
      res.json(out);
    });


    r.put("/", (req, res) => res.json(saveProfile(req, req.body)));

 // ✅ NEW: Preferences
 r.get("/preferences", (req, res) => res.json(getProfilePreferences(req)));
 r.put("/preferences", (req, res) => res.json(saveProfilePreferences(req, req.body)));


r.get("/trends", (req, res) => {
  const ctx = (req as any).ctx;
  const db = (req as any).app.locals.db;

  const days = Number(req.query.days ?? 7);
  const windowDays = Number.isFinite(days) ? Math.max(1, Math.min(60, Math.floor(days))) : 7;

  const rows = fetchTrendLogs(db, {
    actorUserId: ctx.userId,
    subjectMemberId: ctx.activeMemberId,
    windowDays,
  });

  const trend = computeTrendFromLogs(rows, new Date(), { windowDays });
  res.json({ trend });
});



r.get("/meal-context", (req, res) => {
  const days = queryInt(req.query.days, 0, { min: 1, max: 180 });   // 0 means “use env default”
  const limit = queryInt(req.query.limit, 0, { min: 0, max: 500 });

  const ctx = buildMealContext(req, {
    trendDays: days || undefined,
    recentLimit: limit || undefined,
  });

  res.json(ctx);
});


r.post("/score-input-preview", (req, res) => {
  // Expect: { input: MealInput }
  const body = req.body as any;
  const input = body?.input;

  if (!input || typeof input !== "object") {
    return res.status(400).json({ error: "INVALID_INPUT" });
  }

  // Basic validation (avoid hardcoding by using env with safe defaults)
  const MAX_TEXT = envInt("MEALINPUT_MAX_TEXT", 5000);
  const MAX_ITEMS = envInt("MEALINPUT_MAX_ITEMS", 50);
  const MAX_IMAGES = envInt("MEALINPUT_MAX_IMAGES", 6);

  if (typeof input.capturedAt !== "string") {
    return res.status(400).json({ error: "INVALID_CAPTURED_AT" });
  }

  if (input.itemsText && String(input.itemsText).length > MAX_TEXT) {
    return res.status(400).json({ error: "ITEMS_TEXT_TOO_LARGE" });
  }

  if (Array.isArray(input.items) && input.items.length > MAX_ITEMS) {
    return res.status(400).json({ error: "TOO_MANY_ITEMS" });
  }

  if (Array.isArray(input.imageRefs) && input.imageRefs.length > MAX_IMAGES) {
    return res.status(400).json({ error: "TOO_MANY_IMAGES" });
  }

  // Use capturedAt as the scoring "now" to keep deterministic behavior
  const nowIso = new Date(input.capturedAt).toISOString();

  // Build context using existing pipeline
  // IMPORTANT: this does NOT persist anything.
  const trendDays = queryInt(req.query.days, 0, { min: 1, max: 180 }) || undefined;

  const ctx = buildMealContext(
    req,
    { trendDays },
    {
      nowIso,
      mealTypeHint: input.mealTypeHint ?? null,
      mealInput: input,
    }
  );

  // Deterministic scoring baseline (AI must NOT run in privacy mode; AI not added here)
  const scoring = scoreMealContext(ctx);

  return res.json({
    scoring,
    trend: ctx.trend,
    derived: { mealType: ctx.mealType ?? null },
  });
});




r.get("/score-preview", (req, res) => {
  const days = queryInt(req.query.days, 0, { min: 1, max: 180 });
  const ctx = buildMealContext(req, { trendDays: days || undefined });
  const scoring = scoreMealContext(ctx);
  res.json({ scoring, trend: ctx.trend });
});


  return r;
}
