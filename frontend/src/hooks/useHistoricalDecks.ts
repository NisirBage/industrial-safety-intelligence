import { useQuery } from "@tanstack/react-query";

import { getHistoricalDecks } from "../api/historical";

/** Every Historical Intelligence deck - static authored metadata, no polling needed. */
export function useHistoricalDecks() {
  return useQuery({
    queryKey: ["historical", "decks"],
    queryFn: getHistoricalDecks,
    staleTime: 5 * 60 * 1000,
  });
}
