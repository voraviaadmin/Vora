import type { Request, Response, NextFunction } from "express";

export function errorHandler() {
  return (err: any, _req: Request, res: Response, _next: NextFunction) => {
    const message = typeof err?.message === "string" ? err.message : "UNKNOWN_ERROR";

    // Map known errors to status codes
    const status =
      message === "GROUP_NAME_ALREADY_EXISTS_FOR_OWNER" ? 409 :
      message === "MEMBER_NOT_ALLOWED" ? 403 :
      message.startsWith("FORBIDDEN") ? 403 :
      message.startsWith("INVALID") ? 400 :
      message.endsWith("NOT_FOUND") ? 404 :
      message === "UNAUTHENTICATED" ? 401 :
      500;

    res.status(status).json({ error: message });
  };
}
