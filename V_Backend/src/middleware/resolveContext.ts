import type { Request, Response, NextFunction } from "express";
import type { Db } from "../db/connection";
import { ensureUserAndMember } from "../modules/me/bootstrap";
import type { ProfileSummary } from "../intelligence/engine"; // adjust path if needed
import { decryptProfile } from "../modules/profile/crypto"; // adjust path


export type AppContext = {
  userId: string;
  memberId: string; // canonical “self member”
  mode: "Individual" | "Family" | "Workplace";
  activeMemberId: string;
  allowedMemberIds: string[]; // server validated
  requestId: string; // 👈 add
  profileMode: "privacy" | "sync";
  syncEnabled: boolean;

    // ✅ NEW (optional, only in sync mode)
    preferences?: any | null;
    profile?: any | null;
    profileSummary?: ProfileSummary | null;
};

declare global {
  namespace Express {
    interface Request {
      ctx?: AppContext;
    }
  }
}

function uniq(arr: string[]) {
  return Array.from(new Set(arr));
}


function safeDecrypt(encryptedJson: any) {
  try {
    if (!encryptedJson || typeof encryptedJson !== "string") return null;
    return decryptProfile(encryptedJson);
  } catch (e) {
    console.warn("DECRYPT_FAILED", (e as any)?.message ?? e);
    return null;
  }
}

/**
 * Minimal “engine-ready” ProfileSummary.
 * This avoids relying on user_profile_secure shape.
 */
function buildProfileSummaryFromPrefs(prefs: any) {
  const goal = prefs?.goal === "lose" || prefs?.goal === "gain" || prefs?.goal === "maintain"
    ? prefs.goal
    : "maintain";

  const cuisines = Array.isArray(prefs?.cuisines) ? prefs.cuisines.filter(Boolean) : [];

  const health = prefs?.health && typeof prefs.health === "object" ? prefs.health : {};
  const diabetes = !!health.diabetes;
  const highBP = !!health.highBP;
  const fattyLiver = !!health.fattyLiver;

  // Keep it super defensive and only populate what your engine uses.
  return {
    derived: { primaryGoal: goal },
    preferences: { cuisines },
    health: { diabetes, highBP, fattyLiver },
  };
}


export function apiMeta(req: any) {
  const mode = req?.ctx?.profileMode ?? "privacy";
  const syncMode = !!req?.ctx?.syncEnabled;
  const requestId = req?.ctx?.requestId ?? req?.id;
  return { mode, syncMode, requestId };
}

export function apiOk(req: any, data: any) {
  return { meta: apiMeta(req), data };
}

export function apiErr(
  req: any,
  code: string,
  message: string,
  action: string,
  status = 400,
  retryable = false
) {
  return {
    status,
    body: {
      meta: apiMeta(req),
      error: { code, message, action, retryable },
    },
  };
}



export function requireSyncMode() {
  return function (req: Request, res: Response, next: NextFunction) {
    const mode: "privacy" | "sync" = req?.ctx?.profileMode ?? "privacy";
    const requestId = req?.ctx?.requestId ?? (req as any).id;

    if (mode !== "sync") {
      const r = apiErr(req, "MODE_BLOCKED", "This feature requires Sync Mode.", "Enable Sync in Profile.", 403);
      return res.status(r.status).json(r.body);
    }
    next();
  };
}


export function resolveContext() {
  return function (req: Request, res: Response, next: NextFunction) {
    const db: Db | undefined = req.app.locals.db;
    if (!db) return res.status(500).json({ error: "SERVER_MISCONFIG", message: "DB not attached" });

    const userId = req.auth?.userId;
    if (!userId) return res.status(401).json({ error: "UNAUTHENTICATED" });

    const { memberId } = ensureUserAndMember(db, userId);

    // Find groups this member belongs to (active)
    const groups = db
      .prepare(
        `
        SELECT g.groupId, g.groupType, gt.canLogForOthers
        FROM group_members gm
        JOIN groups g ON g.groupId = gm.groupId AND g.deletedAt IS NULL
        JOIN group_types gt ON gt.groupType = g.groupType
        WHERE gm.memberId = ?
          AND gm.leftAt IS NULL
        `
      )
      .all(memberId) as Array<{ groupId: string; groupType: string; canLogForOthers: number }>;

    // Allowed members to act on: self always + any members in groups that allow it (FWGB)
    const allowedMemberIds: string[] = [memberId];

    for (const g of groups) {
      if (g.canLogForOthers === 1) {
        const membersInGroup = db
          .prepare(
            `
            SELECT memberId
            FROM group_members
            WHERE groupId = ?
              AND leftAt IS NULL
            `
          )
          .all(g.groupId) as Array<{ memberId: string }>;

        for (const m of membersInGroup) allowedMemberIds.push(m.memberId);
      }
    }

// Mode: default to Family if any group with canLogForOthers (FWGB), else Individual
const mode: AppContext["mode"] =
  groups.some((g) => g.canLogForOthers === 1) ? "Family" : "Individual";

// Load persisted activeMemberId (if any)
const row = db
  .prepare(
    `
    SELECT activeMemberId
    FROM user_state
    WHERE userId = ?
    `
  )
  .get(userId) as { activeMemberId: string } | undefined;

const persistedActive =
  row && allowedMemberIds.includes(row.activeMemberId)
    ? row.activeMemberId
    : memberId;


    const settings = db
    .prepare("SELECT mode FROM profile_settings WHERE userId=?")
    .get(userId) as { mode?: string } | undefined;
  
  // ✅ Allow header override (useful for dev/testing + explicit callers)
  // Production-safe default: only allow header override when not production.
  const headerMode = String(req.header("x-vora-mode") || "").trim().toLowerCase();
  const allowHeaderOverride = process.env.NODE_ENV !== "production";
  
  const resolvedMode =
    allowHeaderOverride && headerMode === "sync"
      ? "sync"
      : settings?.mode === "sync"
        ? "sync"
        : "privacy";
  
  const profileMode: "privacy" | "sync" = resolvedMode;
  const syncEnabled = profileMode === "sync";
  




// At top inside resolveContext() middleware function, before req.ctx assignment
const headerRid = String(req.header("x-vora-request-id") || "").trim();
const requestId =
  headerRid ||
  (req as any).id ||
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;


  let preferences: any | null = null;
let profile: any | null = null;
let profileSummary: any | null = null;

if (syncEnabled) {
  // preferences
  const prefRow = db
    .prepare("SELECT encryptedJson FROM user_profile_preferences_secure WHERE userId=?")
    .get(userId) as { encryptedJson?: string } | undefined;

  preferences = safeDecrypt(prefRow?.encryptedJson);

  // optional: full profile (if you need it elsewhere)
  const profRow = db
    .prepare("SELECT encryptedJson FROM user_profile_secure WHERE userId=?")
    .get(userId) as { encryptedJson?: string } | undefined;

  profile = safeDecrypt(profRow?.encryptedJson);

  // build summary for engine/vector usage
  profileSummary = preferences ? buildProfileSummaryFromPrefs(preferences) : null;
}



req.ctx = {
  userId,
  memberId,
  mode,
  activeMemberId: persistedActive,
  allowedMemberIds: uniq(allowedMemberIds),
  requestId,
  profileMode,
syncEnabled,

preferences,
profile,
profileSummary,
};



//console.log("[ctx]", {  userId,  mode: profileMode,  path: req.path,});



next();

  };
}


