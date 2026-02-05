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

  return {
    health: { diabetes, highBP, fattyLiver },
    goal,
    cuisines: cleanedCuisines,
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

  const encrypted = encryptProfile(prefs);

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

