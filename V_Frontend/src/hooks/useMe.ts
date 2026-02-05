// src/hooks/useMe.ts
import { useEffect, useState } from "react";
import { apiJson } from "../api/client";

export type MeResponse = {
  userId: string;
  memberId: string | null;
  activeMemberId: string | null;
  allowedMemberIds: string[];
};

type UseMeResult = {
  data: MeResponse | null;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
};

export function useMe(): UseMeResult {
  const [data, setData] = useState<MeResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let mounted = true;

    async function load() {
      setIsLoading(true);
      setError(null);

      try {
        const resp = await apiJson<MeResponse>("/v1/me");
        if (!mounted) return;
        setData(resp);
      } catch (e: any) {
        if (!mounted) return;
        setError(e instanceof Error ? e : new Error("Failed to load user"));
        setData(null);
      } finally {
        if (!mounted) return;
        setIsLoading(false);
      }
    }

    load();
    return () => {
      mounted = false;
    };
  }, []);

  return {
    data,
    isLoading,
    isError: !!error,
    error,
  };
}