import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createGroup } from "../api/groups";

export function useCreateGroup() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (body: { name: string; groupType?: string }) => createGroup(body),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["groups"] });
    },
  });
}
