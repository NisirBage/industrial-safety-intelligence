import { useQuery } from "@tanstack/react-query";

import { getGraphEntity } from "../api/graph";

export function useGraphEntity(kind: string | undefined, id: string | undefined) {
  return useQuery({
    queryKey: ["graph", "entity", kind, id],
    queryFn: () => getGraphEntity(kind as string, id as string),
    enabled: kind !== undefined && id !== undefined,
  });
}
