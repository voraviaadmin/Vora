import { Router } from "express";
import { getHomeSummary } from "./service";

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
  r.get("/summary", (req, res) => {
    const window = normalizeWindow(req.query.window);
    const limit = parseLimit(req.query.limit);

    const out = getHomeSummary(req, { window, limit });
    res.json(out);
  });

  return r;
}
