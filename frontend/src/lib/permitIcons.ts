import type { Permit } from "../api/types";

export type PermitGlyph = "hot_work" | "confined_space" | "isolation" | "line_break" | "generic";

/**
 * The four canonical `permit_type` values `GET /scenario-builder/
 * options` returns - confirmed live against the running backend to be
 * snake_case (`hot_work`, `confined_space`, `electrical_isolation`,
 * `line_break`), not the title-cased display strings a first pass at
 * this file assumed (a real mismatch caught during live verification:
 * `permitTypeGlyph` and `lib/sopReferences.ts`'s permit-type table were
 * both keyed by "Hot Work" etc., which never matched the real
 * persisted value, so both silently fell back to their generic case).
 * This is the one place that maps the raw value to a human label -
 * previously duplicated as a private `PERMIT_TYPE_LABELS` inside
 * `ScenarioBuilderPage.tsx`, now shared from here instead.
 */
export const PERMIT_TYPE_LABELS: Record<string, string> = {
  hot_work: "Hot Work",
  confined_space: "Confined Space",
  electrical_isolation: "Isolation (Electrical)",
  line_break: "Line Break",
};

/** Cosmetic only - "hot_work" -> "Hot Work". Falls back to the raw
 * value (not a guess) for anything this table doesn't recognize. */
export function formatPermitType(permitType: string): string {
  return PERMIT_TYPE_LABELS[permitType] ?? permitType;
}

/**
 * Pure match over the real, snake_case `permit_type` values - never a
 * new taxonomy, just a display glyph per already-existing type.
 * Anything unrecognized (future permit type) falls back to the
 * generic clipboard glyph rather than crashing or guessing.
 */
export function permitTypeGlyph(permitType: string): PermitGlyph {
  const normalized = permitType.toLowerCase();
  if (normalized === "hot_work") return "hot_work";
  if (normalized === "confined_space") return "confined_space";
  if (normalized.includes("isolation")) return "isolation";
  if (normalized === "line_break") return "line_break";
  return "generic";
}

/**
 * `permit_type` values for whichever permits in an already-fetched
 * list belong to one zone - the shared derivation every `PlantMap`
 * caller (Overview, Time Machine, Scenario Replay, Digital Twin)
 * needs to turn its own `usePermits({ status: "active" })` result
 * into `PlantMapZone.activePermitTypes`, written once instead of
 * four times.
 */
export function activePermitTypesForZone(permits: Permit[], zoneId: string): string[] {
  return permits.filter((permit) => permit.zone_id === zoneId).map((permit) => permit.permit_type);
}
