// src/utils/trends.ts

export type TrendOptions = {
    windowDays: number;               // e.g. 3, 5, 7, 14, 30
    goodScoreThreshold?: number;      // default 70
    includeToday?: boolean;           // default true
  };
  
  export type TrendResult = {
    windowDays: number;
    avgScore: number | null;
    countScored: number;
    bestScore: number | null;
    worstScore: number | null;
  
    streakDaysWithLogs: number;       // consecutive days with >=1 log
    streakDaysWithGoodScore: number;  // consecutive days with daily avg >= threshold
  
    daily: Array<{
      day: string;                    // YYYY-MM-DD
      count: number;                  // logs that day
      avgScore: number | null;        // avg of scored logs that day
    }>;
  };
  
  type LogRow = {
    score: number | null;
    capturedAt: string | null;
    createdAt: string;
  };
  
  function isoDayLocal(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }
  
  function parseIsoOrNull(s: any): Date | null {
    if (!s || typeof s !== "string") return null;
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }
  
  function clampInt(n: number, min: number, max: number) {
    return Math.max(min, Math.min(max, Math.floor(n)));
  }
  
  function avg(nums: number[]): number | null {
    if (nums.length === 0) return null;
    return nums.reduce((a, c) => a + c, 0) / nums.length;
  }
  
  /**
   * Pure trend computation from logs already filtered to the window.
   * You control the window via options.windowDays.
   */
  export function computeTrendFromLogs(
    logs: LogRow[],
    now: Date = new Date(),
    options: TrendOptions = { windowDays: 7 }
  ): TrendResult {
    const windowDays = clampInt(options.windowDays, 1, 60); // cap to keep payload sane
    const goodScoreThreshold = options.goodScoreThreshold ?? 70;
    const includeToday = options.includeToday ?? true;
  
    const days: string[] = [];
    const startOffset = includeToday ? 0 : 1;
  
    for (let i = startOffset; i < windowDays + startOffset; i++) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      days.push(isoDayLocal(d));
    }
  
    const bucket = new Map<string, { scores: number[]; count: number }>();
    for (const day of days) bucket.set(day, { scores: [], count: 0 });
  
    let total = 0;
    let totalCount = 0;
    let best: number | null = null;
    let worst: number | null = null;
  
    for (const l of logs) {
      const when = parseIsoOrNull(l.capturedAt) ?? parseIsoOrNull(l.createdAt);
      if (!when) continue;
  
      const day = isoDayLocal(when);
      const b = bucket.get(day);
      if (!b) continue;
  
      b.count += 1;
  
      if (typeof l.score === "number") {
        b.scores.push(l.score);
        total += l.score;
        totalCount += 1;
        best = best == null ? l.score : Math.max(best, l.score);
        worst = worst == null ? l.score : Math.min(worst, l.score);
      }
    }
  
    // For charting: oldest -> newest
    const daily = days
      .slice()
      .reverse()
      .map((day) => {
        const b = bucket.get(day)!;
        const a = avg(b.scores);
        return { day, count: b.count, avgScore: a == null ? null : Math.round(a) };
      });
  
    const avgScore = totalCount > 0 ? Math.round(total / totalCount) : null;
  
    // Streaks count from "most recent day" backwards.
    // If includeToday=false, streak starts from yesterday.
    const daysMostRecentFirst = days.slice(); // already most-recent-first by construction
  
    let streakDaysWithLogs = 0;
    for (const day of daysMostRecentFirst) {
      const b = bucket.get(day)!;
      if (b.count > 0) streakDaysWithLogs += 1;
      else break;
    }
  
    let streakDaysWithGoodScore = 0;
    for (const day of daysMostRecentFirst) {
      const b = bucket.get(day)!;
      if (b.scores.length === 0) break;
      const dayAvg = avg(b.scores)!;
      if (dayAvg >= goodScoreThreshold) streakDaysWithGoodScore += 1;
      else break;
    }
  
    return {
      windowDays,
      avgScore,
      countScored: totalCount,
      bestScore: best,
      worstScore: worst,
      streakDaysWithLogs,
      streakDaysWithGoodScore,
      daily,
    };
  }
  
  /**
   * DB query helper: fetch only rows needed for trends for a given window.
   * This keeps computeTrendFromLogs pure and reusable.
   */
  export function fetchTrendLogs(db: any, params: {
    actorUserId: string;
    subjectMemberId: string;
    windowDays: number;
  }) {
    const windowDays = clampInt(params.windowDays, 1, 60);
  
    // SQLite datetime window; uses capturedAt if present else createdAt
    return db.prepare(`
      SELECT score, capturedAt, createdAt
      FROM logs
      WHERE actorUserId = ?
        AND subjectMemberId = ?
        AND deletedAt IS NULL
        AND COALESCE(capturedAt, createdAt) >= datetime('now', ?)
      ORDER BY COALESCE(capturedAt, createdAt) DESC
    `).all(params.actorUserId, params.subjectMemberId, `-${windowDays} days`);
  }
  