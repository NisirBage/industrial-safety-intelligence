import { describe, expect, it } from "vitest";

import type { RiskAssessment, Zone } from "../api/types";
import { filterJournalEntries, sortJournalEntriesByTimestampDesc, type JournalEntry } from "./decisionJournal";

const ZONE_A = "11111111-1111-1111-1111-111111111111";
const ZONE_B = "22222222-2222-2222-2222-222222222222";

const zones: Zone[] = [
  { zone_id: ZONE_A, name: "Tank Farm", plant_section: "Storage", oisd_area_classification: "zone_0" },
  { zone_id: ZONE_B, name: "Compressor House", plant_section: "Utilities", oisd_area_classification: "zone_1" },
];

function assessment(overrides: Partial<RiskAssessment> = {}): RiskAssessment {
  return {
    assessment_id: "a1",
    zone_id: ZONE_A,
    timestamp: "2026-07-01T08:00:00+00:00",
    compound_risk_score: 50,
    confidence: 1,
    tier: "watch",
    justification: {
      schema_version: 1,
      rules_fired: ["saturating_threshold_function"],
      agent_contributions: {},
      interaction_bonus_applied: 0,
      tier_before: "watch",
      tier_after: "watch",
    },
    ...overrides,
  };
}

describe("sortJournalEntriesByTimestampDesc", () => {
  it("orders entries newest first", () => {
    const entries: JournalEntry[] = [
      { zoneId: ZONE_A, assessment: assessment({ timestamp: "2026-07-01T08:00:00+00:00" }) },
      { zoneId: ZONE_A, assessment: assessment({ timestamp: "2026-07-02T08:00:00+00:00" }) },
    ];
    const sorted = sortJournalEntriesByTimestampDesc(entries);
    expect(sorted[0].assessment.timestamp).toBe("2026-07-02T08:00:00+00:00");
  });
});

describe("filterJournalEntries", () => {
  const entries: JournalEntry[] = [
    { zoneId: ZONE_A, assessment: assessment({ tier: "critical" }) },
    {
      zoneId: ZONE_B,
      assessment: assessment({
        zone_id: ZONE_B,
        tier: "normal",
        justification: {
          schema_version: 1,
          rules_fired: ["no_open_permits"],
          agent_contributions: {},
          interaction_bonus_applied: 0,
          tier_before: "normal",
          tier_after: "normal",
        },
      }),
    },
  ];

  it("filters by exact tier", () => {
    const result = filterJournalEntries(entries, zones, { tier: "critical" });
    expect(result).toHaveLength(1);
    expect(result[0].zoneId).toBe(ZONE_A);
  });

  it("filters by exact zone", () => {
    const result = filterJournalEntries(entries, zones, { zoneId: ZONE_B });
    expect(result).toHaveLength(1);
    expect(result[0].zoneId).toBe(ZONE_B);
  });

  it("searches the zone's real name, case-insensitively", () => {
    const result = filterJournalEntries(entries, zones, { search: "compressor" });
    expect(result).toHaveLength(1);
    expect(result[0].zoneId).toBe(ZONE_B);
  });

  it("searches fired rule identifiers", () => {
    const result = filterJournalEntries(entries, zones, { search: "saturating_threshold" });
    expect(result).toHaveLength(1);
    expect(result[0].zoneId).toBe(ZONE_A);
  });

  it("returns everything when no filters are set", () => {
    expect(filterJournalEntries(entries, zones, {})).toHaveLength(2);
  });
});
