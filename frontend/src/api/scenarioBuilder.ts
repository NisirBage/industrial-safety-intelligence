import { apiGet, apiPost } from "./client";
import type {
  EquipmentInfo,
  ScenarioBuilderOptions,
  ScenarioDefinitionDraft,
  ScenarioExecutionResult,
  ScenarioValidationResult,
  SensorInfo,
  Worker,
} from "./types";

/** GET /api/v1/workers - global worker list (Scenario Builder's
 * authorizing-officer picker). */
export function getWorkers(): Promise<Worker[]> {
  return apiGet<Worker[]>("/api/v1/workers");
}

/** GET /api/v1/zones/{zoneId}/sensors - which gas type(s) a zone
 * monitors, so the builder never lets a user author a sensor event
 * with no matching sensor. */
export function getZoneSensors(zoneId: string): Promise<SensorInfo[]> {
  return apiGet<SensorInfo[]>(`/api/v1/zones/${zoneId}/sensors`);
}

/** GET /api/v1/zones/{zoneId}/equipment - read-only equipment browser;
 * equipment has no scenario-event concept. */
export function getZoneEquipment(zoneId: string): Promise<EquipmentInfo[]> {
  return apiGet<EquipmentInfo[]>(`/api/v1/zones/${zoneId}/equipment`);
}

/** GET /api/v1/scenario-builder/options - frozen curve/permit/gas-type
 * reference data, never hardcoded a second time here. */
export function getBuilderOptions(): Promise<ScenarioBuilderOptions> {
  return apiGet<ScenarioBuilderOptions>("/api/v1/scenario-builder/options");
}

/** POST /api/v1/scenario-builder/validate - dry run, never writes. */
export function validateScenario(
  draft: ScenarioDefinitionDraft,
): Promise<ScenarioValidationResult> {
  return apiPost<ScenarioValidationResult>("/api/v1/scenario-builder/validate", draft);
}

/** POST /api/v1/scenario-builder/execute - this app's first-ever
 * write call. Persists sensor readings/permits and runs them through
 * the unmodified risk pipeline. */
export function executeScenario(
  draft: ScenarioDefinitionDraft,
): Promise<ScenarioExecutionResult> {
  return apiPost<ScenarioExecutionResult>("/api/v1/scenario-builder/execute", draft);
}
