import { useMutation, useQueries, useQuery } from "@tanstack/react-query";

import {
  executeScenario,
  getBuilderOptions,
  getWorkers,
  getZoneEquipment,
  getZoneSensors,
  validateScenario,
} from "../api/scenarioBuilder";

/** Reference data (curve types, permit types, gas types) - static
 * within a session, same staleTime discipline as useZones. */
export function useBuilderOptions() {
  return useQuery({
    queryKey: ["scenario-builder", "options"],
    queryFn: getBuilderOptions,
    staleTime: 5 * 60 * 1000,
  });
}

export function useWorkers() {
  return useQuery({
    queryKey: ["workers"],
    queryFn: getWorkers,
    staleTime: 5 * 60 * 1000,
  });
}

export function useZoneSensors(zoneId: string | undefined) {
  return useQuery({
    queryKey: ["zones", zoneId, "sensors"],
    queryFn: () => getZoneSensors(zoneId as string),
    enabled: zoneId !== undefined,
  });
}

/** Sensors for every given zone at once - the draft's validation
 * context needs to know every zone's monitored gas type(s), not just
 * whichever zone the "add sensor event" form currently has selected. */
export function useAllZoneSensors(zoneIds: string[]) {
  return useQueries({
    queries: zoneIds.map((zoneId) => ({
      queryKey: ["zones", zoneId, "sensors"],
      queryFn: () => getZoneSensors(zoneId),
    })),
  });
}

export function useZoneEquipment(zoneId: string | undefined) {
  return useQuery({
    queryKey: ["zones", zoneId, "equipment"],
    queryFn: () => getZoneEquipment(zoneId as string),
    enabled: zoneId !== undefined,
  });
}

/** Both /validate and /execute are one-shot actions triggered by a
 * button, not data the page polls for - mutations, not queries. */
export function useValidateScenario() {
  return useMutation({ mutationFn: validateScenario });
}

export function useExecuteScenario() {
  return useMutation({ mutationFn: executeScenario });
}
