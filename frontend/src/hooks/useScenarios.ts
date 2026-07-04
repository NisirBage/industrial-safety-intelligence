import { useQuery } from "@tanstack/react-query";

import { getScenario, getScenarios } from "../api/scenarios";

/** The scenario library - static files, no polling needed. */
export function useScenarios() {
  return useQuery({
    queryKey: ["scenarios"],
    queryFn: getScenarios,
    staleTime: 5 * 60 * 1000,
  });
}

export function useScenario(key: string | undefined) {
  return useQuery({
    queryKey: ["scenarios", key],
    queryFn: () => getScenario(key as string),
    enabled: key !== undefined,
    staleTime: 5 * 60 * 1000,
  });
}
