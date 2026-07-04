import { describe, expect, it } from "vitest";

import type { RiskAssessment } from "../api/types";
import {
  averageCompoundScore,
  countTodaysIncidents,
  highestRiskZone,
  isEscalation,
  isSameCalendarDay,
  percentZonesNormal,
  plantReadiness,
} from "./executiveKpis";

function assessment(overrides: Partial<RiskAssessment> = {}): RiskAssessment {
  return {
    assessment_id: "a1",
    zone_id: "z1",
    timestamp: "2026-07-04T08:00:00+00:00",
    compound_risk_score: 50,
    confidence: 1,
    tier: "watch",
    justification: {
      schema_version: 1,
      rules_fired: [],
      agent_contributions: {},
      interaction_bonus_applied: 0,
      tier_before: "normal",
      tier_after: "watch",
    },
    ...overrides,
  };
}

describe("isEscalation", () => {
  it("is true when tier_after is more severe than tier_before", () => {
    expect(isEscalation(assessment())).toBe(true);
  });

  it("is false when the tier stayed the same", () => {
    expect(
      isEscalation(
        assessment({
          justification: {
            schema_version: 1,
            rules_fired: [],
            agent_contributions: {},
            interaction_bonus_applied: 0,
            tier_before: "critical",
            tier_after: "critical",
          },
        }),
      ),
    ).toBe(false);
  });

  it("is false for a de-escalation", () => {
    expect(
      isEscalation(
        assessment({
          justification: {
            schema_version: 1,
            rules_fired: [],
            agent_contributions: {},
            interaction_bonus_applied: 0,
            tier_before: "critical",
            tier_after: "watch",
          },
        }),
      ),
    ).toBe(false);
  });

  it("is false when justification doesn't parse", () => {
    expect(isEscalation(assessment({ justification: {} }))).toBe(false);
  });
});

describe("isSameCalendarDay", () => {
  // Comparisons use local-time getters (getFullYear/getMonth/getDate)
  // deliberately - "today" means the viewer's own calendar day, not
  // UTC. Fixture times sit at local noon, not near a UTC/local
  // midnight boundary, so this test holds regardless of which
  // timezone it runs in.
  it("matches the same year/month/day regardless of time", () => {
    const reference = new Date();
    reference.setHours(12, 0, 0, 0);
    const sameDayLater = new Date(reference);
    sameDayLater.setHours(13, 0, 0, 0);
    expect(isSameCalendarDay(sameDayLater.toISOString(), reference)).toBe(true);
  });

  it("does not match a different day", () => {
    const reference = new Date();
    reference.setHours(12, 0, 0, 0);
    const yesterday = new Date(reference);
    yesterday.setDate(yesterday.getDate() - 1);
    expect(isSameCalendarDay(yesterday.toISOString(), reference)).toBe(false);
  });
});

describe("countTodaysIncidents", () => {
  it("counts only escalations that happened today", () => {
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const laterToday = new Date(today);
    laterToday.setHours(13, 0, 0, 0);

    const assessments = [
      assessment({ timestamp: laterToday.toISOString() }), // escalation, today
      assessment({ timestamp: yesterday.toISOString() }), // escalation, yesterday
      assessment({
        timestamp: today.toISOString(),
        justification: {
          schema_version: 1,
          rules_fired: [],
          agent_contributions: {},
          interaction_bonus_applied: 0,
          tier_before: "watch",
          tier_after: "watch",
        },
      }), // no escalation, today
    ];
    expect(countTodaysIncidents(assessments, today)).toBe(1);
  });
});

describe("averageCompoundScore", () => {
  it("averages compound_risk_score across assessments", () => {
    expect(
      averageCompoundScore([assessment({ compound_risk_score: 40 }), assessment({ compound_risk_score: 60 })]),
    ).toBe(50);
  });

  it("returns 0 for an empty list", () => {
    expect(averageCompoundScore([])).toBe(0);
  });
});

describe("highestRiskZone", () => {
  it("returns the entry with the highest compound_risk_score", () => {
    const entries = [
      { zoneId: "z1", assessment: assessment({ compound_risk_score: 40 }) },
      { zoneId: "z2", assessment: assessment({ compound_risk_score: 90 }) },
    ];
    expect(highestRiskZone(entries)?.zoneId).toBe("z2");
  });

  it("returns null for an empty list", () => {
    expect(highestRiskZone([])).toBeNull();
  });
});

describe("plantReadiness", () => {
  it("is not_ready when any zone is critical", () => {
    expect(
      plantReadiness([assessment({ tier: "normal" }), assessment({ tier: "critical" })]),
    ).toBe("not_ready");
  });

  it("is degraded when the worst zone is watch or elevated", () => {
    expect(plantReadiness([assessment({ tier: "normal" }), assessment({ tier: "elevated" })])).toBe(
      "degraded",
    );
  });

  it("is ready when every zone is normal", () => {
    expect(plantReadiness([assessment({ tier: "normal" }), assessment({ tier: "normal" })])).toBe(
      "ready",
    );
  });

  it("is ready for an empty list", () => {
    expect(plantReadiness([])).toBe("ready");
  });
});

describe("percentZonesNormal", () => {
  it("computes the share of zones at normal", () => {
    expect(
      percentZonesNormal([
        assessment({ tier: "normal" }),
        assessment({ tier: "normal" }),
        assessment({ tier: "critical" }),
        assessment({ tier: "watch" }),
      ]),
    ).toBe(50);
  });

  it("returns 100 for an empty list", () => {
    expect(percentZonesNormal([])).toBe(100);
  });
});
