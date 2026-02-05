import type { Db } from "../../db/connection";
import crypto from "node:crypto";

export type BootstrapResult = {
  userId: string;
  memberId: string;
};

export function ensureUserAndMember(db: Db, userId: string): BootstrapResult {
  const existing = db
    .prepare("SELECT userId, memberId FROM users WHERE userId = ? AND deletedAt IS NULL")
    .get(userId) as { userId: string; memberId: string } | undefined;

  if (existing) return existing;

  const memberId = crypto.randomUUID();

  const tx = db.transaction(() => {
    // Create member with a safe placeholder name that can be updated in Profile.
    // This is not demo data; it's a real record for a real user, just unnamed initially.
    db.prepare(
      `INSERT INTO members (memberId, displayName, billingType)
       VALUES (?, ?, 'Self')`
    ).run(memberId, "Me");

    db.prepare(
      `INSERT INTO users (userId, memberId)
       VALUES (?, ?)`
    ).run(userId, memberId);
  });

  tx();

  return { userId, memberId };
}


export function bootstrapMe(db: Db) {
  db.prepare(
    `
    CREATE TABLE IF NOT EXISTS user_state (
      userId TEXT PRIMARY KEY,
      activeMemberId TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    )
    `
  ).run();
}