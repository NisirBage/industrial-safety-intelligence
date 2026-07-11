import { useQuery } from "@tanstack/react-query";

import { getGraphNeighbors } from "../api/graph";

/** One-hop neighborhood of a node - the query React Query itself
 * already caches per (kind, id), so expanding the same node twice in
 * one session never re-fetches (Part 14's "cache subgraphs"). */
export function useGraphNeighbors(kind: string | undefined, id: string | undefined) {
  return useQuery({
    queryKey: ["graph", "neighbors", kind, id],
    queryFn: () => getGraphNeighbors(kind as string, id as string),
    enabled: kind !== undefined && id !== undefined,
    staleTime: 5 * 60 * 1000,
  });
}
