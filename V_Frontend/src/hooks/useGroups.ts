import { useQuery } from "@tanstack/react-query";
import { listGroups } from "../api/groups";
import { useModeGate } from "./use-mode-gate";

export function useGroups() {
  const { mode } = useModeGate();

  return useQuery({
    queryKey: ["groups"],
    queryFn: listGroups,
    enabled: mode === "sync",
  });
}