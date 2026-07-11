import { useQuery } from "@tanstack/react-query";

import { searchGraphEntities } from "../api/graph";

export function useGraphSearch(query: string) {
  const trimmed = query.trim();
  return useQuery({
    queryKey: ["graph", "search", trimmed],
    queryFn: () => searchGraphEntities(trimmed),
    enabled: trimmed.length > 0,
  });
}
