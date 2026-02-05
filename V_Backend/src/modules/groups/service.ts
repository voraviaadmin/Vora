import type { Request } from "express";
import type { Db } from "../../db/connection";
import crypto from "node:crypto";
import { writeAuditEvent} from "../../audit/audit";

type CreateGroupBody = {
  groupType: string;
  name: string;
};

type JoinBody = {
  inviteCode: string;
};

type CreateChildMemberBody = {
  displayName: string;
};

function getDb(req: Request): Db {
  const db: Db | undefined = req.app.locals.db;
  if (!db) throw new Error("DB not attached");
  return db;
}

function requireCtx(req: Request) {
  if (!req.ctx) throw new Error("Context not resolved");
  return req.ctx;
}

function mustBeOwner(db: Db, groupId: string, actorMemberId: string) {
  const row = db.prepare(
    `SELECT role FROM group_members
     WHERE groupId = ? AND memberId = ? AND leftAt IS NULL`
  ).get(groupId, actorMemberId) as { role: string } | undefined;

  if (!row) throw new Error("NOT_IN_GROUP");
  if (row.role !== "Owner") throw new Error("FORBIDDEN_OWNER_ONLY");
}

function getGroupTypeCaps(db: Db, groupType: string) {
  const row = db.prepare(
    `SELECT groupType, canCreateMembers, canLogForOthers, supportsGroupBilling
     FROM group_types WHERE groupType = ?`
  ).get(groupType) as
    | { groupType: string; canCreateMembers: number; canLogForOthers: number; supportsGroupBilling: number }
    | undefined;

  if (!row) throw new Error("INVALID_GROUP_TYPE");
  return row;
}

function getGroup(db: Db, groupId: string) {
  const row = db.prepare(
    `SELECT groupId, groupType, name, deletedAt
     FROM groups WHERE groupId = ?`
  ).get(groupId) as { groupId: string; groupType: string; name: string; deletedAt: string | null } | undefined;

  if (!row || row.deletedAt) throw new Error("GROUP_NOT_FOUND");
  return row;
}

function nowIso(): string {
  return new Date().toISOString();
}

function makeInviteCode(): string {
  // Short, human-friendly code. (No hard dependency on external libs.)
  // Example: "K8Q3Z7P2"
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 8; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}

export function createGroup(req: Request, body: CreateGroupBody) {
  const db = getDb(req);
  const ctx = requireCtx(req);

  if (!body?.groupType || !body?.name?.trim()) throw new Error("INVALID_BODY");

  const caps = getGroupTypeCaps(db, body.groupType);


  const duplicate = db
  .prepare(
    `
    SELECT g.groupId
    FROM groups g
    JOIN group_members gm ON gm.groupId = g.groupId
    WHERE g.deletedAt IS NULL
      AND g.groupType = ?
      AND LOWER(g.name) = LOWER(?)
      AND gm.memberId = ?
      AND gm.role = 'Owner'
      AND gm.leftAt IS NULL
    LIMIT 1
    `
  )
  .get(
    body.groupType,
    body.name.trim(),
    ctx.memberId
  ) as { groupId: string } | undefined;

if (duplicate) {
  const err = new Error("GROUP_NAME_ALREADY_EXISTS_FOR_OWNER");
  // @ts-expect-error – attach status for error middleware
  err.status = 409;
  throw err;
}

  

  const groupId = crypto.randomUUID();
  const inviteId = crypto.randomUUID(); // optional default invite, not required; we won’t create by default
  void inviteId;

  const tx = db.transaction(() => {
    db.prepare(
      `INSERT INTO groups (groupId, groupType, name, createdByUserId)
       VALUES (?, ?, ?, ?)`
    ).run(groupId, body.groupType, body.name.trim(), ctx.userId);

    db.prepare(
      `INSERT INTO group_members (groupId, memberId, role)
       VALUES (?, ?, 'Owner')`
    ).run(groupId, ctx.memberId);

    // Billing-enabled groups only: create a group_billing record
    // Rule: default none unless billing-enabled.
    // For FWGB: payer defaults to creator member (typed reference = Member).
    if (caps.supportsGroupBilling === 1) {
      const groupBillingId = crypto.randomUUID();

      // For Insurance/Workplace, payerOrgId would be required in future.
      // For now we default payerEntityType=Member for FWGB only; other billing-enabled types can be configured later.
      if (body.groupType === "FamilyWithBillingGroup") {
        db.prepare(
          `INSERT INTO group_billing
            (groupBillingId, groupId, payerEntityType, payerMemberId, payerOrgId, effectiveFrom, effectiveTo, createdByUserId)
           VALUES (?, ?, 'Member', ?, NULL, ?, NULL, ?)`
        ).run(groupBillingId, groupId, ctx.memberId, nowIso(), ctx.userId);
      }
    }

    writeAuditEvent(db, {
      actorUserId: ctx.userId,
      action: "group.create",
      targetType: "group",
      targetId: groupId,
      requestId: ctx.requestId,
      ip: req.ip,
      userAgent: req.headers["user-agent"],
      metadata: { groupType: body.groupType, name: body.name.trim() },
    });
  });

  tx();

  return { groupId };
}

export function createInvite(req: Request, groupId: string) {
  const db = getDb(req);
  const ctx = requireCtx(req);

  const group = getGroup(db, groupId);
  // Any member can invite? You can later restrict to Owner/Admin.
  // For now, allow any active member in group.
  const membership = db.prepare(
    `SELECT role FROM group_members WHERE groupId = ? AND memberId = ? AND leftAt IS NULL`
  ).get(groupId, ctx.memberId) as { role: string } | undefined;
  if (!membership) throw new Error("NOT_IN_GROUP");

  const inviteId = crypto.randomUUID();

  // Ensure unique inviteCode (retry a few times)
  let inviteCode = "";
  for (let attempt = 0; attempt < 5; attempt++) {
    inviteCode = makeInviteCode();
    const exists = db.prepare(`SELECT 1 FROM group_invites WHERE inviteCode = ?`).get(inviteCode);
    if (!exists) break;
  }
  if (!inviteCode) throw new Error("INVITE_CODE_GENERATION_FAILED");

  db.prepare(
    `INSERT INTO group_invites (inviteId, groupId, createdByUserId, inviteCode)
     VALUES (?, ?, ?, ?)`
  ).run(inviteId, groupId, ctx.userId, inviteCode);

  writeAuditEvent(db, {
    actorUserId: ctx.userId,
    action: "group.invite.create",
    targetType: "group",
    targetId: groupId,
    requestId: ctx.requestId,
    ip: req.ip,
    userAgent: req.headers["user-agent"],
    metadata: { inviteCode },
  });

  return {
    inviteId,
    inviteCode,
    // link is generated by client; backend remains provider-agnostic
    groupId: group.groupId,
  };
}

export function joinByInviteCode(req: Request, body: JoinBody) {
  const db = getDb(req);
  const ctx = requireCtx(req);

  const inviteCode = String(body?.inviteCode ?? "").trim().toUpperCase();
  if (!inviteCode) throw new Error("INVALID_BODY");

  const invite = db.prepare(
    `SELECT inviteId, groupId, revokedAt, expiresAt, maxUses, usesCount
     FROM group_invites
     WHERE inviteCode = ?`
  ).get(inviteCode) as
    | {
        inviteId: string;
        groupId: string;
        revokedAt: string | null;
        expiresAt: string | null;
        maxUses: number | null;
        usesCount: number;
      }
    | undefined;

  if (!invite) throw new Error("INVITE_NOT_FOUND");
  if (invite.revokedAt) throw new Error("INVITE_REVOKED");
  if (invite.expiresAt && new Date(invite.expiresAt).getTime() < Date.now()) throw new Error("INVITE_EXPIRED");
  if (invite.maxUses !== null && invite.usesCount >= invite.maxUses) throw new Error("INVITE_MAXED");

  // Ensure group exists and not deleted
  getGroup(db, invite.groupId);

  const tx = db.transaction(() => {
    const existing = db.prepare(
      `SELECT leftAt FROM group_members WHERE groupId = ? AND memberId = ?`
    ).get(invite.groupId, ctx.memberId) as { leftAt: string | null } | undefined;

    if (!existing) {
      db.prepare(
        `INSERT INTO group_members (groupId, memberId, role)
         VALUES (?, ?, 'Member')`
      ).run(invite.groupId, ctx.memberId);
    } else if (existing.leftAt) {
      db.prepare(
        `UPDATE group_members SET leftAt = NULL, joinedAt = (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
         WHERE groupId = ? AND memberId = ?`
      ).run(invite.groupId, ctx.memberId);
    }
    // else already active: no-op

    db.prepare(
      `UPDATE group_invites SET usesCount = usesCount + 1 WHERE inviteId = ?`
    ).run(invite.inviteId);

    writeAuditEvent(db, {
      actorUserId: ctx.userId,
      action: "group.join",
      targetType: "group",
      targetId: invite.groupId,
      requestId: ctx.requestId,
      ip: req.ip,
      userAgent: req.headers["user-agent"],
      metadata: { inviteCode },
    });
  });

  tx();

  return { groupId: invite.groupId };
}

export function leaveGroup(req: Request, groupId: string) {
  const db = getDb(req);
  const ctx = requireCtx(req);

  // Ensure group exists
  getGroup(db, groupId);

  // Prevent leaving if you are the last Owner
  const roleRow = db.prepare(
    `SELECT role FROM group_members WHERE groupId = ? AND memberId = ? AND leftAt IS NULL`
  ).get(groupId, ctx.memberId) as { role: string } | undefined;
  if (!roleRow) throw new Error("NOT_IN_GROUP");

  if (roleRow.role === "Owner") {
    const owners = db.prepare(
      `SELECT COUNT(*) as cnt FROM group_members WHERE groupId = ? AND role = 'Owner' AND leftAt IS NULL`
    ).get(groupId) as { cnt: number };
    if (owners.cnt <= 1) throw new Error("CANNOT_LEAVE_LAST_OWNER");
  }

  db.prepare(
    `UPDATE group_members SET leftAt = (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
     WHERE groupId = ? AND memberId = ? AND leftAt IS NULL`
  ).run(groupId, ctx.memberId);

  writeAuditEvent(db, {
    actorUserId: ctx.userId,
    action: "group.leave",
    targetType: "group",
    targetId: groupId,
    requestId: ctx.requestId,
    ip: req.ip,
    userAgent: req.headers["user-agent"],
  });

  return { ok: true };
}

export function removeMember(req: Request, groupId: string, memberIdToRemove: string) {
  const db = getDb(req);
  const ctx = requireCtx(req);

  getGroup(db, groupId);
  mustBeOwner(db, groupId, ctx.memberId);

  // Prevent removing the last owner (including if removing self)
  const removingRole = db.prepare(
    `SELECT role FROM group_members WHERE groupId = ? AND memberId = ? AND leftAt IS NULL`
  ).get(groupId, memberIdToRemove) as { role: string } | undefined;
  if (!removingRole) throw new Error("MEMBER_NOT_IN_GROUP");

  if (removingRole.role === "Owner") {
    const owners = db.prepare(
      `SELECT COUNT(*) as cnt FROM group_members WHERE groupId = ? AND role = 'Owner' AND leftAt IS NULL`
    ).get(groupId) as { cnt: number };
    if (owners.cnt <= 1) throw new Error("CANNOT_REMOVE_LAST_OWNER");
  }

  db.prepare(
    `UPDATE group_members SET leftAt = (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
     WHERE groupId = ? AND memberId = ? AND leftAt IS NULL`
  ).run(groupId, memberIdToRemove);

  writeAuditEvent(db, {
    actorUserId: ctx.userId,
    action: "group.member.remove",
    targetType: "member",
    targetId: memberIdToRemove,
    requestId: ctx.requestId,
    ip: req.ip,
    userAgent: req.headers["user-agent"],
    metadata: { groupId },
  });

  return { ok: true };
}

export function createChildMember(req: Request, groupId: string, body: CreateChildMemberBody) {
  const db = getDb(req);
  const ctx = requireCtx(req);

  const group = getGroup(db, groupId);
  const caps = getGroupTypeCaps(db, group.groupType);

  if (caps.canCreateMembers !== 1) throw new Error("FORBIDDEN_GROUP_CANNOT_CREATE_MEMBERS");

  mustBeOwner(db, groupId, ctx.memberId);

  const displayName = String(body?.displayName ?? "").trim();
  if (!displayName) throw new Error("INVALID_BODY");

  const newMemberId = crypto.randomUUID();

  const tx = db.transaction(() => {
    // Create member ONLY. No user record (kid/no-login).
    db.prepare(
      `INSERT INTO members (memberId, displayName, billingType)
       VALUES (?, ?, 'Self')`
    ).run(newMemberId, displayName);

    db.prepare(
      `INSERT INTO group_members (groupId, memberId, role)
       VALUES (?, ?, 'Member')`
    ).run(groupId, newMemberId);

    writeAuditEvent(db, {
      actorUserId: ctx.userId,
      action: "group.member.create",
      targetType: "member",
      targetId: newMemberId,
      requestId: ctx.requestId,
      ip: req.ip,
      userAgent: req.headers["user-agent"],
      metadata: { groupId, displayName },
    });
  });

  tx();

  return { memberId: newMemberId };
}


export function listMyGroups(req: Request) {
  const db = getDb(req);
  const ctx = requireCtx(req);

  // Groups where this member is active
  const groups = db.prepare(
    `
    SELECT g.groupId, g.groupType, g.name,
           gt.supportsGroupBilling
    FROM group_members gm
    JOIN groups g ON g.groupId = gm.groupId AND g.deletedAt IS NULL
    JOIN group_types gt ON gt.groupType = g.groupType
    WHERE gm.memberId = ?
      AND gm.leftAt IS NULL
    ORDER BY g.createdAt DESC
    `
  ).all(ctx.memberId) as Array<{
    groupId: string;
    groupType: string;
    name: string;
    supportsGroupBilling: number;
  }>;

  const out = groups.map((g) => {
    const members = db.prepare(
      `
      SELECT m.memberId, m.displayName, gm.role
      FROM group_members gm
      JOIN members m ON m.memberId = gm.memberId AND m.deletedAt IS NULL
      WHERE gm.groupId = ?
        AND gm.leftAt IS NULL
      ORDER BY
        CASE gm.role WHEN 'Owner' THEN 0 WHEN 'Admin' THEN 1 ELSE 2 END,
        m.createdAt ASC
      `
    ).all(g.groupId) as Array<{ memberId: string; displayName: string; role: string }>;

    let billing: any = null;

    if (g.supportsGroupBilling === 1) {
      const row = db.prepare(
        `
        SELECT payerEntityType, payerMemberId, payerOrgId, effectiveFrom
        FROM group_billing
        WHERE groupId = ?
          AND effectiveTo IS NULL
        ORDER BY effectiveFrom DESC
        LIMIT 1
        `
      ).get(g.groupId) as
        | { payerEntityType: string; payerMemberId: string | null; payerOrgId: string | null; effectiveFrom: string }
        | undefined;

      if (row) {
        billing = {
          payerEntityType: row.payerEntityType,
          payerMemberId: row.payerMemberId,
          payerOrgId: row.payerOrgId,
          effectiveFrom: row.effectiveFrom,
        };
      } else {
        billing = { payerEntityType: null };
      }
    }

    return {
      groupId: g.groupId,
      groupType: g.groupType,
      name: g.name,
      supportsGroupBilling: g.supportsGroupBilling === 1,
      members,
      billing,
    };
  });

  return { groups: out };
}


type ChangePayerBody = {
  payerMemberId: string;
};

export function changeGroupPayer(req: Request, groupId: string, body: ChangePayerBody) {
  const db = getDb(req);
  const ctx = requireCtx(req);

  const payerMemberId = String(body?.payerMemberId ?? "").trim();
  if (!payerMemberId) throw new Error("INVALID_BODY");

  const group = getGroup(db, groupId);
  const caps = getGroupTypeCaps(db, group.groupType);

  // Only billing-enabled groups can have a payer
  if (caps.supportsGroupBilling !== 1) throw new Error("FORBIDDEN_GROUP_NOT_BILLING_ENABLED");

  // For MVP: only FWGB supports member-selected payer
  if (group.groupType !== "FamilyWithBillingGroup") throw new Error("FORBIDDEN_PAYER_CHANGE_NOT_ALLOWED");

  // Owner only
  mustBeOwner(db, groupId, ctx.memberId);

  // New payer must be an active member of this group
  const payerIsMember = db.prepare(
    `SELECT 1 FROM group_members
     WHERE groupId = ? AND memberId = ? AND leftAt IS NULL`
  ).get(groupId, payerMemberId);

  if (!payerIsMember) throw new Error("PAYER_NOT_IN_GROUP");

  const now = nowIso();

  const tx = db.transaction(() => {
    // Find current billing row (effectiveTo is NULL)
    const current = db.prepare(
      `SELECT groupBillingId, payerEntityType, payerMemberId
       FROM group_billing
       WHERE groupId = ? AND effectiveTo IS NULL
       ORDER BY effectiveFrom DESC
       LIMIT 1`
    ).get(groupId) as
      | { groupBillingId: string; payerEntityType: string; payerMemberId: string | null }
      | undefined;

    // If current payer is already this member, no-op (idempotent)
    if (current && current.payerEntityType === "Member" && current.payerMemberId === payerMemberId) {
      writeAuditEvent(db, {
        actorUserId: ctx.userId,
        action: "group.billing.payer.noop",
        targetType: "group",
        targetId: groupId,
        requestId: ctx.requestId,
        ip: req.ip,
        userAgent: req.headers["user-agent"],
        metadata: { payerMemberId },
      });
      return;
    }

    // Close current billing record if exists
    if (current) {
      db.prepare(
        `UPDATE group_billing
         SET effectiveTo = ?
         WHERE groupBillingId = ?`
      ).run(now, current.groupBillingId);
    }

    // Insert new effective record
    const groupBillingId = crypto.randomUUID();
    db.prepare(
      `INSERT INTO group_billing
        (groupBillingId, groupId, payerEntityType, payerMemberId, payerOrgId, effectiveFrom, effectiveTo, createdByUserId)
       VALUES (?, ?, 'Member', ?, NULL, ?, NULL, ?)`
    ).run(groupBillingId, groupId, payerMemberId, now, ctx.userId);

    writeAuditEvent(db, {
      actorUserId: ctx.userId,
      action: "group.billing.payer.change",
      targetType: "group",
      targetId: groupId,
      requestId: ctx.requestId,
      ip: req.ip,
      userAgent: req.headers["user-agent"],
      metadata: { payerMemberId, previousGroupBillingId: current?.groupBillingId ?? null },
    });
  });

  tx();

  return { groupId, payerMemberId, effectiveFrom: now };
}
