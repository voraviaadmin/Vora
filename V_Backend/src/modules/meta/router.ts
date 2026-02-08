import { Router } from "express";

/**
 * Canonical cuisine catalog endpoints.
 * - Centralized (system metadata)
 * - Deterministic resolve (no OpenAI)
 * - Analytics-ready (requestId + user context already exist via middleware)
 */

type CuisineRow = {
  id: string;
  label: string;
  aliasesJson: string | null; // stored as JSON string
  active: number; // sqlite int
  sortOrder: number | null;
};

function normalizeCuisine(s: string): string {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^a-z0-9\s\-]/g, "");
}

function parseAliases(aliasesJson: string | null): string[] {
  if (!aliasesJson) return [];
  try {
    const v = JSON.parse(aliasesJson);
    if (Array.isArray(v)) return v.map(String);
    return [];
  } catch {
    return [];
  }
}

function getDb(req: any) {
  return req.app.locals.db;
}

export function metaRouter() {
  const r = Router();

  // GET /v1/meta/cuisines
  r.get("/cuisines", (req, res) => {
    const db = getDb(req);

    const rows: CuisineRow[] = db
      .prepare(
        `
        SELECT id, label, aliasesJson, active, sortOrder
        FROM cuisine_catalog
        WHERE active=1
        ORDER BY COALESCE(sortOrder, 9999) ASC, label ASC
      `
      )
      .all();

    const cuisines = rows.map((row) => ({
      id: row.id,
      label: row.label,
      aliases: parseAliases(row.aliasesJson),
      active: !!row.active,
      sortOrder: row.sortOrder ?? null,
    }));

    res.json({ data: { cuisines } });
  });

  // POST /v1/meta/cuisines/resolve
  // Body: { raw: string }
  r.post("/cuisines/resolve", (req, res) => {
    const db = getDb(req);
    const raw = req.body?.raw;

    if (typeof raw !== "string" || !raw.trim()) {
      return res.status(400).json({ error: "INVALID_RAW" });
    }

    const normalized = normalizeCuisine(raw);

    const rows: CuisineRow[] = db
      .prepare(
        `
        SELECT id, label, aliasesJson, active, sortOrder
        FROM cuisine_catalog
        WHERE active=1
      `
      )
      .all();

    // deterministic matching priority:
    // 1) exact id match
    // 2) exact label match
    // 3) exact alias match
    // 4) contains match (label/alias) as a last resort (lower confidence)
    let best: { cuisineId: string; confidence: number; via: string } | null = null;

    for (const row of rows) {
      const idNorm = normalizeCuisine(row.id);
      if (normalized === idNorm) {
        best = { cuisineId: row.id, confidence: 1.0, via: "id" };
        break;
      }
    }

    if (!best) {
      for (const row of rows) {
        const labelNorm = normalizeCuisine(row.label);
        if (normalized === labelNorm) {
          best = { cuisineId: row.id, confidence: 0.95, via: "label" };
          break;
        }
      }
    }

    if (!best) {
      for (const row of rows) {
        const aliases = parseAliases(row.aliasesJson);
        for (const a of aliases) {
          if (normalized === normalizeCuisine(a)) {
            best = { cuisineId: row.id, confidence: 0.9, via: "alias" };
            break;
          }
        }
        if (best) break;
      }
    }

    if (!best) {
      // last resort: "contains" match (useful for "south indian", "indian vegetarian")
      // keep confidence low to avoid misclassification.
      let containsHit: { cuisineId: string; via: string } | null = null;

      for (const row of rows) {
        const labelNorm = normalizeCuisine(row.label);
        if (labelNorm && (normalized.includes(labelNorm) || labelNorm.includes(normalized))) {
          containsHit = { cuisineId: row.id, via: "contains_label" };
          break;
        }

        const aliases = parseAliases(row.aliasesJson);
        for (const a of aliases) {
          const aNorm = normalizeCuisine(a);
          if (aNorm && (normalized.includes(aNorm) || aNorm.includes(normalized))) {
            containsHit = { cuisineId: row.id, via: "contains_alias" };
            break;
          }
        }
        if (containsHit) break;
      }

      if (containsHit) {
        best = { cuisineId: containsHit.cuisineId, confidence: 0.6, via: containsHit.via };
      }
    }

    res.json({
      data: {
        raw,
        normalized,
        match: best ? best : null,
      },
    });
  });

  return r;
}
