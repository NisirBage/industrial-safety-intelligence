import { useQuery } from "@tanstack/react-query";

import { getGraphPath } from "../api/graph";

export function useGraphPath(
  source: { kind: string; id: string } | undefined,
  target: { kind: string; id: string } | undefined,
) {
  return useQuery({
    queryKey: ["graph", "path", source?.kind, source?.id, target?.kind, target?.id],
    queryFn: () =>
      getGraphPath(
        source as { kind: string; id: string },
        target as { kind: string; id: string },
      ),
    enabled: source !== undefined && target !== undefined,
  });
}
