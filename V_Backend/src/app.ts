import express from "express";
import type { Db } from "./db/connection";
import { loadEnv } from "./config/env";
import { requestId } from "./middleware/requestId";
import { requireAuth } from "./middleware/auth/requireAuth";
import { resolveContext, apiErr, apiOk } from "./middleware/resolveContext";
import { meRouter } from "./modules/me/router";
import { groupsRouter } from "./modules/groups/router";
import { errorHandler } from "./middleware/errorHandler";
import { logsRouter } from "./modules/logs/router.js";
import { profileRouter } from "./modules/profile/router";
import { scanRouter, syncScanRouter } from "./modules/scan/router";
import { homeRouter } from "./modules/home/router";
import { restaurantsRouter, syncEatOutRouter } from "./modules/restaurants/router";
import { metaRouter } from "./modules/meta/router";






export function createApp(db: Db) {
  const app = express();
  const env = loadEnv();

  app.use(express.json({ limit: "1mb" }));
  app.locals.db = db;

  app.get("/health", (_req, res) => res.json({ ok: true, env: env.DB_ENV }));

  // Correlation + auth + context
  app.use(requestId());
  app.use(requireAuth());
  app.use(resolveContext());


    // -----------------------------
  // Canonical API endpoints (single source of truth)
  // -----------------------------
  const CANON = {
    sync: {
      eatout: { menuScore: "/v1/sync/eatout/menu/score" },
      scan: { scoreV1: "/v1/sync/scan/score-v1" },
    },
  } as const;

  // Live endpoint map (helps testing + agents + future debugging)
  app.get("/v1/meta/endpoints", (req, res) => {
    return res.json(apiOk(req, CANON));
  });

  // -----------------------------
  // Trap legacy / wrong endpoints (return JSON, never HTML 404)
  // Prevents future confusion across chats/tools/scripts.
  // -----------------------------
  const moved = (to: string) => (req: any, res: any) => {
    const r = apiErr(
      req,
      "ENDPOINT_MOVED",
      "This endpoint is not valid. Scoring is Sync-only.",
      `Use ${to}`,
      410,
      false
    );
    return res.status(r.status).json({ ...r.body, movedTo: to });
  };

  // Old / mistaken paths (common confusion)
  app.all("/v1/restaurants/menu/score", moved(CANON.sync.eatout.menuScore));
  app.all("/v1/restaurants/menu/score-items", moved(CANON.sync.eatout.menuScore));
  app.all("/v1/scan/score-v1", moved(CANON.sync.scan.scoreV1));
  app.all("/v1/meal/preview", moved(CANON.sync.scan.scoreV1));


  app.use("/v1/home", homeRouter());
  app.use("/v1/me", meRouter());
  app.use("/v1/profile", profileRouter()); 
  app.use("/v1/meta", metaRouter());
  app.use("/v1/groups", groupsRouter());
  app.use("/v1/logs", logsRouter());
  app.use("/v1/scan", scanRouter);
  app.use("/v1/restaurants", restaurantsRouter());
// Hard separation: Sync-only AI
app.use("/v1/sync/scan", syncScanRouter);
app.use("/v1/sync/eatout", syncEatOutRouter());

  
  app.use(errorHandler());

  return app;
}
