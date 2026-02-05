// src/hooks/useLogs.ts
import { useCallback, useEffect, useRef, useState } from "react";
import { useMode } from "../state/mode";
import { apiJson } from "../api/client";

export type LogItem = {
  id: string;
  timestamp: number; // unix ms
  label: string;
  score: number;
};

export type UseLogsState = {
  logs: LogItem[];
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  refetch: () => Promise<void>;
};

function normalizeErr(e: any): string {
  if (!e) return "Unknown error";
  if (typeof e === "string") return e;
  if (e?.message) return String(e.message);
  return "Failed to load logs";
}

export function useLogs(): UseLogsState {
  const { mode } = useMode();

  const [logs, setLogs] = useState<LogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const aliveRef = useRef(true);
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  const load = useCallback(
    async (kind: "load" | "refresh") => {
      try {
        if (kind === "load") setLoading(true);
        if (kind === "refresh") setRefreshing(true);
        setError(null);

        // 🔐 Privacy mode: no server calls, no personalization
        if (mode === "privacy") {
          if (!aliveRef.current) return;
          setLogs([]); // future: local-only logs can live here
          return;
        }

        // ✅ Sync mode: fetch server logs
        const resp = await apiJson<LogItem[]>("/v1/logs");

        if (!aliveRef.current) return;
        setLogs(Array.isArray(resp) ? resp : []);
      } catch (e: any) {
        if (!aliveRef.current) return;
        setError(normalizeErr(e));
        setLogs([]);
      } finally {
        if (!aliveRef.current) return;
        setLoading(false);
        setRefreshing(false);
      }
    },
    [mode]
  );

  useEffect(() => {
    load("load");
  }, [load]);

  const refetch = useCallback(async () => {
    await load("refresh");
  }, [load]);

  return {
    logs,
    loading,
    refreshing,
    error,
    refetch,
  };
}