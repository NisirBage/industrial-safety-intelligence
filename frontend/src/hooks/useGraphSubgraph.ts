import { useQuery } from "@tanstack/react-query";

import { getGraphSubgraph } from "../api/graph";

export function useGraphSubgraph(
  kind: string | undefined,
  id: string | undefined,
  options: { depth?: number; maxNodes?: number } = {},
) {
  return useQuery({
    queryKey: ["graph", "subgraph", kind, id, options.depth, options.maxNodes],
    queryFn: () => getGraphSubgraph(kind as string, id as string, options),
    enabled: kind !== undefined && id !== undefined,
    staleTime: 5 * 60 * 1000,
  });
}
