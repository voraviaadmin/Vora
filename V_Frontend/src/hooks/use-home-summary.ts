// src/hooks/use-home-summary.ts
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFocusEffect } from "expo-router";

import { getHomeSummary, type HomeSummaryResponse, type HomeWindow } from "../api/home";
import { useMode } from "../state/mode";
import { getLocalLogs, type LocalLog } from "../storage/local-logs";

/**
 * Simple in-memory cache (per app session).
 */
type CacheKey = `${HomeWindow}:${number}:${"privacy" | "sync"}`;
type CacheValue = { at: number; data: HomeSummaryResponse };

const CACHE = new Map<CacheKey, CacheValue>();

export type UseHomeSummaryState = {
  window: HomeWindow;
  limit: number;
  data: HomeSummaryResponse | null;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  invalidate: () => void;
};

function keyFor(window: HomeWindow, limit: number, mode: "privacy" | "sync"): CacheKey {
  return `${window}:${limit}:${mode}`;
}

function normalizeErr(e: any): string {
  if (!e) return "Unknown error";
  if (typeof e === "string") return e;
  if (e?.message) return String(e.message);
  if (e?.error?.message) return String(e.error.message);
  return "Request failed";
}

export function invalidateHomeSummary(window?: HomeWindow) {
  if (!window) {
    CACHE.clear();
    return;
  }
  for (const k of CACHE.keys()) {
    if (k.startsWith(`${window}:`)) CACHE.delete(k);
  }
}

/* ----------------------------- Privacy helpers ---------------------------- */

function startOfLocalDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function daysAgoStart(n: number) {
  const d = startOfLocalDay(new Date());
  d.setDate(d.getDate() - n);
  return d;
}

function windowStart(window: HomeWindow) {
  const now = new Date();
  return window === "daily"
    ? startOfLocalDay(now)
    : window === "3d"
      ? daysAgoStart(2)
      : window === "7d"
        ? daysAgoStart(6)
        : daysAgoStart(13);
}

function filterLogsForWindow(logs: LocalLog[], window: HomeWindow) {
  const start = windowStart(window).getTime();
  return logs.filter((l) => {
    const t = new Date(l.capturedAt).getTime();
    return Number.isFinite(t) && t >= start;
  });
}

function avgScore(logs: LocalLog[]) {
  if (!logs.length) return 0;
  const sum = logs.reduce((acc, l) => acc + (Number(l.scoring?.score) || 0), 0);
  return Math.round(sum / logs.length);
}

function calcStreakDays(logs: LocalLog[]) {
  // streak = consecutive local-days (including today) where at least 1 log exists
  const set = new Set<string>();
  for (const l of logs) {
    const d = new Date(l.capturedAt);
    if (!Number.isFinite(d.getTime())) continue;
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    set.add(key);
  }

  let streak = 0;
  const cur = startOfLocalDay(new Date());
  while (true) {
    const key = `${cur.getFullYear()}-${cur.getMonth()}-${cur.getDate()}`;
    if (!set.has(key)) break;
    streak += 1;
    cur.setDate(cur.getDate() - 1);
  }
  return streak;
}

function labelForWindow(window: HomeWindow) {
  return window === "daily"
    ? "Daily Score"
    : window === "3d"
      ? "3-Day Score"
      : window === "7d"
        ? "7-Day Score"
        : "14-Day Score";
}

function buildPrivacyHomeSummary(window: HomeWindow, allLogs: LocalLog[]): HomeSummaryResponse {
  const current = filterLogsForWindow(allLogs, window);
  const score = avgScore(current);
  const streakDays = calcStreakDays(allLogs);
  const count = current.length;

  const description =
    count === 0
      ? "Log a meal to build your score."
      : count === 1
        ? "Based on 1 local log."
        : `Based on ${count} local logs.`;

  // Keep shape compatible with your existing Home UI (header/hero/actions/etc)
  return {
    header: {
      modeLabel: "Privacy • Local",
      streakDays,
    },
    heroScore: {
      value: score,
      label: labelForWindow(window),
      statusWord: score >= 75 ? "Great" : score >= 50 ? "Good" : score > 0 ? "Start" : "Start",
      description,
      resetsText: "Tap ring to switch window",
    },
    actions: {
      primaryCta: { title: "Scan Food", subtitle: null },
      secondaryCta: { title: "Find Restaurant" },
    },
    todaysFocus: {
      title: "Today’s Focus",
      chips: [],
    },
    suggestion: {
      title: "Best next meal",
      suggestionText:
        count === 0 ? "Log 1–2 meals to unlock a recommendation." : "Keep logging to improve accuracy.",
      contextNote: "",
    },
  } as any;
}

/* ---------------------------------- Hook --------------------------------- */

export function useHomeSummary(window: HomeWindow = "daily", limit: number = 5): UseHomeSummaryState {
  const { mode } = useMode();

  const cacheKey = useMemo(() => keyFor(window, limit, mode), [window, limit, mode]);

  const [data, setData] = useState<HomeSummaryResponse | null>(() => {
    const hit = CACHE.get(cacheKey);
    return hit?.data ?? null;
  });

  const [loading, setLoading] = useState<boolean>(() => !CACHE.has(cacheKey));
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const aliveRef = useRef(true);
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  const fetchOnce = useCallback(
    async (loadMode: "load" | "refresh") => {
      try {
        if (loadMode === "load") setLoading(true);
        if (loadMode === "refresh") setRefreshing(true);
        setError(null);

        // 🔐 Privacy: compute from local logs (no backend)
        if (mode === "privacy") {
          const all = await getLocalLogs();
          const resp = buildPrivacyHomeSummary(window, all);

          if (!aliveRef.current) return;
          CACHE.set(cacheKey, { at: Date.now(), data: resp });
          setData(resp);
          return;
        }

        // ☁️ Sync: server-backed
        const resp = await (getHomeSummary as any)(window, limit);

        if (!aliveRef.current) return;
        CACHE.set(cacheKey, { at: Date.now(), data: resp });
        setData(resp);
      } catch (e: any) {
        if (!aliveRef.current) return;
        setError(normalizeErr(e));
      } finally {
        if (!aliveRef.current) return;
        setLoading(false);
        setRefreshing(false);
      }
    },
    [cacheKey, limit, mode, window]
  );

  // initial load + whenever cacheKey changes
  useEffect(() => {
    const hit = CACHE.get(cacheKey);
    if (hit?.data) {
      setData(hit.data);
      setLoading(false);
      return;
    }
    fetchOnce("load");
  }, [cacheKey, fetchOnce]);

  // refetch when screen focuses
  useFocusEffect(
    useCallback(() => {
      // don’t “hard refresh” every time if we already have data; but do refresh if empty
      if (!CACHE.has(cacheKey)) {
        fetchOnce("load");
      }
      return () => {};
    }, [cacheKey, fetchOnce])
  );

  const refetch = useCallback(async () => {
    await fetchOnce("refresh");
  }, [fetchOnce]);

  const invalidate = useCallback(() => {
    invalidateHomeSummary(window);
  }, [window]);

  return {
    window,
    limit,
    data,
    loading,
    refreshing,
    error,
    refetch,
    invalidate,
  };
}