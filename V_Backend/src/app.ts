import express from "express";
import type { Db } from "./db/connection";
import { loadEnv } from "./config/env";
import { requestId } from "./middleware/requestId";
import { requireAuth } from "./middleware/auth/requireAuth";
import { resolveContext } from "./middleware/resolveContext";
import { meRouter } from "./modules/me/router";
import { groupsRouter } from "./modules/groups/router";
import { errorHandler } from "./middleware/errorHandler";
import { logsRouter } from "./modules/logs/router.js";
import { profileRouter } from "./modules/profile/router";
import { scanRouter, syncScanRouter } from "./modules/scan/router";
import { homeRouter } from "./modules/home/router";
import { restaurantsRouter, syncEatOutRouter } from "./modules/restaurants/router";



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

  app.use("/v1/home", homeRouter());
  app.use("/v1/me", meRouter());
  app.use("/v1/profile", profileRouter()); 
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
