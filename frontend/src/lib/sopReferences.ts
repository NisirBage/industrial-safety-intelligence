/**
 * Item 5 (SOP Integration) - maps deterministic recommendations to
 * plant SOP references. Two lookup tables, checked in order:
 * permit-type is more specific than recommendation-id (a permit-
 * related action's real SOP depends on *which* permit is active in
 * the zone, not just which rule fired), so `getSopReference` prefers
 * it when an active permit type is supplied. A recommendation this
 * table has no entry for returns `null` rather than a fabricated
 * reference - an operator should never be pointed at a document
 * number this platform invented. `externalUrl` is a placeholder (a
 * real deployment would point this at the plant's own document
 * management system - not something this platform can know) - `null`
 * where no link has been configured, never a fabricated URL.
 */
export interface SopReference {
  title: string;
  standard: string;
  section: string;
  summary: string;
  externalUrl: string | null;
}

/**
 * Keyed by the real, snake_case `permit_type` values
 * `GET /scenario-builder/options` returns (confirmed live against the
 * running backend), not the title-cased display labels
 * `lib/permitIcons.ts::formatPermitType` produces for humans - an
 * earlier pass at this table used the display labels as keys, which
 * silently never matched any real permit and always fell through to
 * the recommendation-id table below. Caught during this milestone's
 * live browser verification, fixed here.
 */
export const SOP_BY_PERMIT_TYPE: Record<string, SopReference> = {
  hot_work: {
    title: "Hot Work Permit Procedure",
    standard: "OISD-STD-105",
    section: "Section 7.2",
    summary: "Requirements for suspending or revoking an active hot work permit when gas or exposure risk rises.",
    externalUrl: null,
  },
  confined_space: {
    title: "Confined Space Entry Procedure",
    standard: "OISD-STD-192",
    section: "Section 4.1",
    summary: "Entry suspension and emergency withdrawal requirements for confined space work.",
    externalUrl: null,
  },
  electrical_isolation: {
    title: "Electrical Isolation Procedure",
    standard: "Plant Procedure IS-14",
    section: "Section 2",
    summary: "Lockout/tagout and isolation-verification steps before electrical work may proceed or must halt.",
    externalUrl: null,
  },
  line_break: {
    title: "Line Break Permit Procedure",
    standard: "OISD-STD-244",
    section: "Section 5.3",
    summary: "Depressurization and isolation confirmation requirements before and during a line break.",
    externalUrl: null,
  },
};

export const SOP_BY_RECOMMENDATION_ID: Record<string, SopReference> = {
  tier_critical: {
    title: "Emergency Evacuation Procedure",
    standard: "Emergency Response Plan",
    section: "Section 3.1",
    summary: "Non-essential personnel evacuation and shift supervisor notification at CRITICAL tier.",
    externalUrl: null,
  },
  tier_elevated: {
    title: "Elevated Monitoring Procedure",
    standard: "Emergency Response Plan",
    section: "Section 2.4",
    summary: "Increased monitoring cadence and response-readiness confirmation at ELEVATED tier.",
    externalUrl: null,
  },
  unauthorized_presence: {
    title: "Headcount Verification Procedure",
    standard: "OISD-STD-192",
    section: "Section 6",
    summary: "Headcount reconciliation and removal of personnel operating without an active permit.",
    externalUrl: null,
  },
  common_cause_grouped_degradation_count: {
    title: "Common-Cause Equipment Inspection",
    standard: "Maintenance Procedure MP-22",
    section: "Section 1",
    summary: "Inspection sequence when multiple equipment items degrade under a shared cause.",
    externalUrl: null,
  },
  missing_equipment_context: {
    title: "Equipment Telemetry Fallback Procedure",
    standard: "Maintenance Procedure MP-22",
    section: "Section 3",
    summary: "Manual equipment status confirmation when telemetry is unavailable.",
    externalUrl: null,
  },
  interaction_bonus_applied: {
    title: "SIMOPS Concurrent Activity Review",
    standard: "Plant SIMOPS Guideline",
    section: "Section 1.2",
    summary: "Review procedure when multiple independent risk factors are compounding simultaneously.",
    externalUrl: null,
  },
};

/**
 * `activePermitTypes` takes priority (a permit-specific SOP is more
 * actionable than a generic one). Falls through to the recommendation-
 * id table, then to `null` - never guesses.
 */
export function getSopReference(
  recommendationId: string,
  activePermitTypes: string[],
): SopReference | null {
  for (const permitType of activePermitTypes) {
    const byPermit = SOP_BY_PERMIT_TYPE[permitType];
    if (byPermit) {
      return byPermit;
    }
  }
  return SOP_BY_RECOMMENDATION_ID[recommendationId] ?? null;
}
