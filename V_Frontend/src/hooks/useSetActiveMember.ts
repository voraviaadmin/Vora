import { useMutation, useQueryClient } from "@tanstack/react-query";
import { setActiveMember } from "../api/me";

export function useSetActiveMember() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (memberId: string) => setActiveMember({ memberId }),
    onSuccess: () => {
      // Refresh Me (drives activeMemberId everywhere)
      qc.invalidateQueries({ queryKey: ["me"] });
      // Refresh logs (your logs key includes memberId, but this is a safe nudge)
      qc.invalidateQueries({ queryKey: ["logs"] });
      qc.invalidateQueries({ queryKey: ["groups"] });
    },
  });
}
