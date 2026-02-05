import type { Request } from "express";
import { writeAuditEvent } from "../../audit/audit";


function getCtx(req: Request) {
  // Your resolveContext middleware likely attaches this.
  // If your code uses req.ctx or req.locals.ctx, adjust here.
  const anyReq = req as any;
  const ctx = anyReq.ctx ?? anyReq.context ?? anyReq.locals?.ctx;
  if (!ctx) throw new Error("CTX_MISSING");
  return ctx;
}

function getDb(req: Request) {
  const anyReq = req as any;
  const db = anyReq.app?.locals?.db;
  if (!db) throw new Error("DB_MISSING");
  return db;
}

// Existing
export function getMe(req: Request) {
  const ctx = getCtx(req);

  return {
    userId: ctx.userId,
    memberId: ctx.memberId,
    mode: ctx.mode,
    activeMemberId: ctx.activeMemberId ?? ctx.memberId,
    allowedMemberIds: ctx.allowedMemberIds ?? [ctx.memberId],
  };
}

// New
export function setActiveMember(req: Request, body: any) {
  const ctx = getCtx(req);
  const db = getDb(req);

  const memberId = String(body?.memberId ?? "").trim();
  if (!memberId) {
    const err: any = new Error("MEMBER_ID_REQUIRED");
    err.status = 400;
    throw err;
  }

  const allowed: string[] = ctx.allowedMemberIds ?? [ctx.memberId];
  if (!allowed.includes(memberId)) {
    const err: any = new Error("MEMBER_NOT_ALLOWED");
    err.status = 403;
    throw err;
  }

  // Persist selection (minimal table strategy):
  // If you already have a "users" table or "sessions" table, adjust.
  // We'll store it in a simple "user_state" table.
  db.prepare(
    `
    CREATE TABLE IF NOT EXISTS user_state (
      userId TEXT PRIMARY KEY,
      activeMemberId TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    )
    `
  ).run();

  db.prepare(
    `
    INSERT INTO user_state (userId, activeMemberId, updatedAt)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(userId) DO UPDATE SET
      activeMemberId = excluded.activeMemberId,
      updatedAt = excluded.updatedAt
    `
  ).run(ctx.userId, memberId);


  writeAuditEvent(db, {
    actorUserId: ctx.userId,
    action: "ACTIVE_MEMBER_SET",
    targetType: "member",
    targetId: memberId,
    requestId: ctx.requestId, // ✅ from ctx
    ip: req.ip,
    userAgent: req.headers["user-agent"],
    metadata: {
      prevActiveMemberId: ctx.activeMemberId ?? null,
    },
  });
  
  


  // Return updated Me (also update ctx view)
  return {
    userId: ctx.userId,
    memberId: ctx.memberId,
    mode: ctx.mode,
    activeMemberId: memberId,
    allowedMemberIds: allowed,
  };
}
