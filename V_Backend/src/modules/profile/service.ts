import type { Request } from "express";
import { encryptProfile, decryptProfile } from "./crypto";
import { writeAudit } from "../../audit/audit";



function getCtx(req: Request) {
  const anyReq = req as any;
  return anyReq.ctx;
}

function getDb(req: Request) {
  return (req as any).app.locals.db;
}


/**
 * Some parts of your code refer to "mode" while others refer to "syncEnabled".
 * This helper supports both shapes so we don't break existing behavior.
 */
function isSyncEnabled(settings: any): boolean {
  return !!settings && settings.mode === "sync";
}


function normalizeCuisine(s: string): string {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^a-z0-9\s\-]/g, "");
}


function buildCuisineLookup(db: any) {
  const rows = db
    .prepare(
      `
      SELECT id, label, aliasesJson
      FROM cuisine_catalog
      WHERE active=1
    `
    )
    .all() as Array<{ id: string; label: string; aliasesJson: string | null }>;

  const idByNorm = new Map<string, string>();
  const labelByNorm = new Map<string, string>();
  const aliasByNorm = new Map<string, string>();

  for (const r of rows) {
    idByNorm.set(normalizeCuisine(r.id), r.id);
    labelByNorm.set(normalizeCuisine(r.label), r.id);

    if (r.aliasesJson) {
      try {
        const arr = JSON.parse(r.aliasesJson);
        if (Array.isArray(arr)) {
          for (const a of arr) aliasByNorm.set(normalizeCuisine(String(a)), r.id);
        }
      } catch {
        // ignore bad aliasesJson
      }
    }
  }

  return { idByNorm, labelByNorm, aliasByNorm };
}

function deriveCuisineIdsAndCustoms(
  cuisines: string[],
  lookup: ReturnType<typeof buildCuisineLookup>
) {
  const ids = new Set<string>();
  const customs: string[] = [];

  for (const raw of cuisines) {
    const n = normalizeCuisine(raw);
    const hit =
      lookup.idByNorm.get(n) ||
      lookup.labelByNorm.get(n) ||
      lookup.aliasByNorm.get(n) ||
      null;

    if (hit) ids.add(hit);
    else customs.push(raw);
  }

  return { cuisineIds: Array.from(ids), customCuisines: customs };
}








function assertPreferencesShape(prefs: any) {
  if (!prefs || typeof prefs !== "object") throw new Error("BAD_PREFERENCES");

  const health = prefs.health;
  if (!health || typeof health !== "object") throw new Error("BAD_PREFERENCES_HEALTH");

  const diabetes = !!health.diabetes;
  const highBP = !!health.highBP;
  const fattyLiver = !!health.fattyLiver;

  const goal = prefs.goal;
  if (goal !== "lose" && goal !== "maintain" && goal !== "gain") {
    throw new Error("BAD_PREFERENCES_GOAL");
  }

  const cuisines = prefs.cuisines;
  if (!Array.isArray(cuisines)) throw new Error("BAD_PREFERENCES_CUISINES");

  const cleanedCuisines = cuisines
    .map((c) => (typeof c === "string" ? c.trim() : ""))
    .filter(Boolean)
    .slice(0, 25);

  // Optional fields (frontend can ignore them; backend can store them)
  const cuisineIds = Array.isArray(prefs.cuisineIds)
    ? prefs.cuisineIds
      .map((x: any) => (typeof x === "string" ? x.trim() : ""))
      .filter(Boolean)
      .slice(0, 50)
    : undefined;

  const customCuisines = Array.isArray(prefs.customCuisines)
    ? prefs.customCuisines
      .map((x: any) => (typeof x === "string" ? x.trim() : ""))
      .filter(Boolean)
      .slice(0, 50)
    : undefined;



  // Optional additions (safe, non-breaking)
  const avoidFoods = Array.isArray(prefs.avoidFoods)
    ? prefs.avoidFoods
      .map((x: any) => (typeof x === "string" ? x.trim() : ""))
      .filter(Boolean)
      .slice(0, 30)
    : undefined;

  const preferFoods = Array.isArray(prefs.preferFoods)
    ? prefs.preferFoods
      .map((x: any) => (typeof x === "string" ? x.trim() : ""))
      .filter(Boolean)
      .slice(0, 30)
    : undefined;

  const allergens = Array.isArray(prefs.allergens)
    ? prefs.allergens
      .map((x: any) => (typeof x === "string" ? x.trim() : ""))
      .filter(Boolean)
      .slice(0, 20)
    : undefined;

  const budgetTier =
    prefs.budgetTier === "low" || prefs.budgetTier === "medium" || prefs.budgetTier === "high"
      ? prefs.budgetTier
      : undefined;

  const restaurantStrategy =
    prefs.restaurantStrategy === "health_first" ||
      prefs.restaurantStrategy === "balanced" ||
      prefs.restaurantStrategy === "enjoy_first"
      ? prefs.restaurantStrategy
      : undefined;


  const aiPersonality =
    prefs.aiPersonality === "straight" ||
      prefs.aiPersonality === "encouraging" ||
      prefs.aiPersonality === "coach"
      ? prefs.aiPersonality
      : undefined;



  return {
    health: { diabetes, highBP, fattyLiver },
    goal,
    cuisines: cleanedCuisines,
    cuisineIds,
    customCuisines,
    aiPersonality,

    // NEW (optional)
    avoidFoods,
    preferFoods,
    allergens,
    budgetTier,
    restaurantStrategy,
  };
}








export function getProfile(req: Request) {
  const ctx = getCtx(req);
  const db = getDb(req);

  const settings = db
    .prepare("SELECT mode FROM profile_settings WHERE userId=?")
    .get(ctx.userId);

  const isSync = settings?.mode === "sync";

  if (!isSync) {
    return { syncEnabled: false };
  }

  const row = db
    .prepare("SELECT encryptedJson FROM user_profile_secure WHERE userId=?")
    .get(ctx.userId);

  return {
    syncEnabled: true,
    profile: row ? decryptProfile(row.encryptedJson) : null,
  };
}

export function enableSync(req: Request) {
  const ctx = getCtx(req);
  const db = (req.app.locals as any).db;

  db.prepare(`
    INSERT INTO profile_settings (userId, mode)
    VALUES (?, 'sync')
    ON CONFLICT(userId) DO UPDATE SET mode='sync'
  `).run(ctx.userId);

  writeAudit(db, {
    actorUserId: ctx.userId,
    action: "PROFILE_SYNC_ENABLED",
    targetType: "profile",
    targetId: ctx.userId,
    requestId: ctx.requestId,
    ip: req.ip,
    userAgent: req.headers["user-agent"],
  });

  return { syncEnabled: true };
}

export function disableSync(req: Request) {
  const ctx = getCtx(req);
  const db = (req.app.locals as any).db;

  const tx = db.transaction(() => {
    db.prepare(`UPDATE profile_settings SET mode='privacy' WHERE userId=?`)
      .run(ctx.userId);

    // 🔥 hard delete sensitive server-side data
    db.prepare(`DELETE FROM user_profile_secure WHERE userId=?`)
      .run(ctx.userId);


    db.prepare("UPDATE logs SET scoringJson=NULL, updatedAt=? WHERE actorUserId=?")
      .run(new Date().toISOString(), ctx.userId);

  });

  tx();

  writeAudit(db, {
    actorUserId: ctx.userId,
    action: "PROFILE_SYNC_DISABLED",
    targetType: "profile",
    targetId: ctx.userId,
    requestId: ctx.requestId,
    ip: req.ip,
    userAgent: req.headers["user-agent"],
  });

  return { syncEnabled: false };
}

export function saveProfile(req: Request, body: any) {
  const ctx = getCtx(req);
  const db = getDb(req);
  const now = new Date().toISOString();

  const settings = db
    .prepare("SELECT mode FROM profile_settings WHERE userId=?")
    .get(ctx.userId);

  if (settings?.mode !== "sync") {
    throw new Error("SYNC_DISABLED");
  }
  const encrypted = encryptProfile(body);

  db.prepare(`
    INSERT INTO user_profile_secure (userId, encryptedJson, updatedAt)
    VALUES (?, ?, ?)
    ON CONFLICT(userId) DO UPDATE SET encryptedJson=excluded.encryptedJson, updatedAt=excluded.updatedAt
  `).run(ctx.userId, encrypted, now);

  writeAudit(db, {
    actorUserId: ctx.userId,
    action: "PROFILE_UPDATED",
    requestId: ctx.requestId,
  });

  return { ok: true };
}



/* ---------------- ✅ NEW: preferences endpoints ---------------- */

export function getProfilePreferences(req: Request) {
  const ctx = getCtx(req);
  const db = getDb(req);

  const settings = db
    .prepare("SELECT mode FROM profile_settings WHERE userId=?")
    .get(ctx.userId);

  // Normalize mode (default = privacy)
  const mode = settings?.mode === "sync" ? "sync" : "privacy";

  // Privacy mode – do not store; return null (client uses defaults)
  if (mode !== "sync") {
    return {
      mode,
      preferences: null,
    };
  }

  const row = db
    .prepare("SELECT encryptedJson FROM user_profile_preferences_secure WHERE userId=?")
    .get(ctx.userId);

  return {
    mode,
    preferences: row ? decryptProfile(row.encryptedJson) : null,
  };
}


export function saveProfilePreferences(req: Request, body: any) {
  const ctx = getCtx(req);
  const db = getDb(req);
  const now = new Date().toISOString();

  const settings = db
    .prepare("SELECT mode FROM profile_settings WHERE userId=?")
    .get(ctx.userId);

  // Privacy mode → ensure server data is wiped and return OK
  if (!isSyncEnabled(settings)) {
    db.prepare(`DELETE FROM user_profile_preferences_secure WHERE userId=?`).run(ctx.userId);
    return { ok: true, stored: false };
  }

  const incoming = body?.preferences ?? body;
  const prefs = assertPreferencesShape(incoming);

  // ✅ Derive cuisineIds/customCuisines deterministically (no OpenAI)
  // Requires cuisine_catalog table (seeded via migration).
  const rows = db
    .prepare(
      `
      SELECT id, label, aliasesJson
      FROM cuisine_catalog
      WHERE active=1
    `
    )
    .all() as Array<{ id: string; label: string; aliasesJson: string | null }>;

  const idByNorm = new Map<string, string>();
  const labelByNorm = new Map<string, string>();
  const aliasByNorm = new Map<string, string>();

  for (const r of rows) {
    idByNorm.set(normalizeCuisine(r.id), r.id);
    labelByNorm.set(normalizeCuisine(r.label), r.id);
    if (r.aliasesJson) {
      try {
        const arr = JSON.parse(r.aliasesJson);
        if (Array.isArray(arr)) {
          for (const a of arr) aliasByNorm.set(normalizeCuisine(String(a)), r.id);
        }
      } catch {
        // ignore bad aliasesJson
      }
    }
  }

  const derivedCuisineIds = new Set<string>();
  const derivedCustoms: string[] = [];

  for (const raw of prefs.cuisines) {
    const n = normalizeCuisine(raw);
    const hit =
      idByNorm.get(n) ||
      labelByNorm.get(n) ||
      aliasByNorm.get(n) ||
      null;

    if (hit) derivedCuisineIds.add(hit);
    else derivedCustoms.push(raw);
  }

  const enrichedPrefs = {
    health: prefs.health,
    goal: prefs.goal,
    cuisines: prefs.cuisines, // keep UI display list as-is

    // IMPORTANT: convert Set to array
    cuisineIds: Array.from(derivedCuisineIds),
    customCuisines: derivedCustoms,

    aiPersonality: prefs.aiPersonality,

    // NEW optional fields carried through
    avoidFoods: prefs.avoidFoods,
    preferFoods: prefs.preferFoods,
    allergens: prefs.allergens,
    budgetTier: prefs.budgetTier,
    restaurantStrategy: prefs.restaurantStrategy,
  };


  const encrypted = encryptProfile(enrichedPrefs);

  db.prepare(`
    INSERT INTO user_profile_preferences_secure (userId, encryptedJson, updatedAt)
    VALUES (?, ?, ?)
    ON CONFLICT(userId) DO UPDATE SET encryptedJson=excluded.encryptedJson, updatedAt=excluded.updatedAt
  `).run(ctx.userId, encrypted, now);

  writeAudit(db, {
    actorUserId: ctx.userId,
    action: "PROFILE_PREFERENCES_UPDATED",
    targetType: "profile",
    targetId: ctx.userId,
    requestId: ctx.requestId,
    ip: req.ip,
    userAgent: req.headers["user-agent"],
  });

  return { ok: true, stored: true };
}

export async function getProfileMode(ctx: any): Promise<"privacy" | "sync"> {
  const row = await ctx.db.profile_settings.findUnique({
    where: { userId: ctx.userId },
    select: { mode: true },
  });
  return (row?.mode as "privacy" | "sync") ?? "privacy";
}

export async function requireSyncMode(ctx: any): Promise<void> {
  const mode = await getProfileMode(ctx);
  if (mode !== "sync") {
    const err: any = new Error("Sync mode required");
    err.status = 403;
    err.code = "SYNC_REQUIRED";
    throw err;
  }
}

