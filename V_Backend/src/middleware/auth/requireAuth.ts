import type { Request, Response, NextFunction } from "express";

declare global {
  namespace Express {
    interface Request {
      auth?: { userId: string };
    }
  }
}

export function requireAuth() {
  return function (req: Request, res: Response, next: NextFunction) {
    const userId = String(req.header("x-user-id") ?? "").trim();

    if (!userId) {
      return res.status(401).json({
        error: "UNAUTHENTICATED",
        message: "Missing x-user-id header (stub auth).",
      });
    }

    req.auth = { userId };
    next();
  };
}
