import type { Request } from "express";
import { getCtx, getDb } from "../logs/service";

type HomeWindow = "daily" | "3d" | "7d" | "14d";

function windowLabel(window: HomeWindow) {
  if (window === "daily") return "Daily Score";
  if (window === "3d") return "3-day Avg";
  if (window === "7d") return "7-day Avg";
  return "14-day Avg";
}

function clampScore(n: any): number | null {
  const v = Number(n);
  if (!Number.isFinite(v)) return null;
  const i = Math.round(v);
  if (i < 0) return 0;
  if (i > 100) return 100;
  return i;
}

function daysForWindow(window: HomeWindow) {
  if (window === "daily") return 1;
  if (window === "3d") return 3;
  if (window === "7d") return 7;
  return 14;
}

// Server-local day boundary for v1 (later: member timezone)
function startOfLocalDayIso(now: Date) {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function isSyncEnabled(db: any, userId: string) {
  const row = db
    .prepare("SELECT mode FROM profile_settings WHERE userId=?")
    .get(userId) as { mode?: string } | undefined;

  return row?.mode === "sync";
}

function statusForScore(score: number, hasData: boolean) {
  if (!hasData) {
    return {
      statusWord: "Start",
      description: "Log a meal to build your daily score.",
    };
  }

  if (score >= 80) return { statusWord: "Excellent", description: "Keep it steady. Small choices add up." };
  if (score >= 65) return { statusWord: "Good", description: "A couple smart choices will help." };
  if (score >= 50) return { statusWord: "Okay", description: "You’re close. One balanced meal can lift today." };
  return { statusWord: "Steady", description: "A protein + fiber combo can help next." };
}

export function getHomeSummary(req: Request, opts: { window: HomeWindow; limit: number }) {
  const ctx = getCtx(req);
  const db = getDb(req);

  // ✅ Member-scoped (activeMemberId), with allowed-member enforcement
  const subjectMemberId = ctx.activeMemberId;
  if (!ctx.allowedMemberIds.includes(subjectMemberId)) {
    throw new Error("MEMBER_NOT_ALLOWED");
  }

  const now = new Date();
  const toIso = now.toISOString();
  const fromIso =
    opts.window === "daily"
      ? startOfLocalDayIso(now)
      : new Date(now.getTime() - daysForWindow(opts.window) * 24 * 60 * 60 * 1000).toISOString();

  // Pull enough rows to compute stable averages even if logs are messy
  const rows = db
    .prepare(
      `
      SELECT
        logId,
        mealType,
        capturedAt,
        score,
        summary
      FROM logs
      WHERE subjectMemberId = ?
        AND deletedAt IS NULL
        AND capturedAt >= ?
        AND capturedAt <= ?
      ORDER BY capturedAt DESC
      LIMIT 200
      `
    )
    .all(subjectMemberId, fromIso, toIso);

  const scores: number[] = [];
  const normalized = rows.map((r: any) => {
    const s = clampScore(r.score);
    if (s != null) scores.push(s);

    return {
      logId: r.logId,
      capturedAt: r.capturedAt ?? null,
      mealType: r.mealType ?? null,
      summary: r.summary ?? null,
      score: s,
    };
  });

  const hasData = scores.length > 0;
  const avgScore = hasData ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;

  const syncOn = isSyncEnabled(db, ctx.userId);
  const syncMode = syncOn ? "sync" : "privacy";

  const status = statusForScore(avgScore, hasData);

  // v1 focus + suggestion: mode-aware placeholders (safe even with messy logs)
  // Later: plug in nutrition totals + next-meal engine here (no Home UI changes).
  const todaysFocus =
    opts.window === "daily"
      ? {
          title: "Today’s Focus",
          chips: [
            { key: "protein", label: "Protein", valueText: "—" },
            { key: "fiber", label: "Fiber", valueText: "—" },
            { key: "sugar", label: "Sugar", valueText: "—" },
          ],
          totals: null as any,
        }
      : null;

  const suggestion =
    opts.window === "daily"
      ? {
          title: "Best next meal",
          suggestionText: syncOn
            ? "A protein-forward meal with fiber would balance today well."
            : "A balanced meal with protein + fiber is a good next step.",
          contextNote: syncOn ? "Based on your preferences and recent logs." : "Enable Sync for deeper personalization.",
          restaurantQuery: null as any,
        }
      : null;

  return {
    meta: {
      window: opts.window,
      generatedAt: new Date().toISOString(),
      syncMode,
      // Home UI can still read /v1/me for display mode; keeping stable + safe here
      mode: "individual",
      subjectMemberId,
    },
    header: {
      title: "Voravia",
      subtitle: null,
      modeLabel: syncOn ? "Today • Sync" : "Today • Private",
      streakDays: 0,
    },
    heroScore: {
      value: avgScore,
      label: windowLabel(opts.window),
      resetsText: "Resets nightly",
      statusWord: status.statusWord,
      description: status.description,
      confidence: null,
    },
    actions: {
      primaryCta: { id: "scan_food", title: "Scan Food", subtitle: null },
      secondaryCta: { id: "find_restaurant", title: "Find Restaurant", subtitle: null },
    },
    todaysFocus,
    suggestion,
    recentLogs: {
      items: normalized.slice(0, opts.limit),
    },
  };
}
