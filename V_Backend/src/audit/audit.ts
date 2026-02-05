import { randomUUID } from "crypto";

export type AuditEvent = {
  actorUserId: string;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  requestId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  metadata?: any;
};

export function writeAuditEvent(db: any, evt: AuditEvent) {
  const auditEventId = randomUUID();

  db.prepare(`
    INSERT INTO audit_events (
      auditEventId,
      actorUserId,
      action,
      targetType,
      targetId,
      requestId,
      ip,
      userAgent,
      metadataJson
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    auditEventId,
    evt.actorUserId,
    evt.action,
    evt.targetType ?? null,
    evt.targetId ?? null,
    evt.requestId ?? null,
    evt.ip ?? null,
    evt.userAgent ?? null,
    evt.metadata ? JSON.stringify(redactMetadata(evt.metadata)) : null
  );

  return auditEventId;
}

export const writeAudit = writeAuditEvent;


function redactMetadata(input: any) {
  if (!input || typeof input !== "object") return input;

  const clone = JSON.parse(JSON.stringify(input));

  // Redact high-risk fields (menu text, OCR, raw images, tokens)
  const REDACT_KEYS = [
    "rawText",
    "ocrText",
    "menuText",
    "imageBase64",
    "prompt",
    "completion",
    "apiKey",
    "authorization",
    "token",
  ];

  for (const k of REDACT_KEYS) {
    if (k in clone) clone[k] = "[REDACTED]";
  }

  return clone;
}