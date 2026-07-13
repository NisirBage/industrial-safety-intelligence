import { describe, expect, it } from "vitest";

import type { RiskAssessment } from "../api/types";
import { buildOperationalNarrative } from "./operationalNarrative";

function assessment(
  timestamp: string,
  tier: RiskAssessment["tier"],
  tierBefore: string,
  tierAfter: string,
  agentContributions: Record<string, { risk: number; confidence: number }> = {},
): RiskAssessment {
  return {
    assessment_id: `a-${timestamp}`,
    zone_id: "z1",
    timestamp,
    compound_risk_score: 50,
    confidence: 0.8,
    tier,
    justification: {
      schema_version: 1,
      rules_fired: [],
      agent_contributions: agentContributions,
      interaction_bonus_applied: 1,
      tier_before: tierBefore,
      tier_after: tierAfter,
    },
  };
}

describe("buildOperationalNarrative", () => {
  it("produces one timestamped sentence per meaningful tick, in order", () => {
    const timeline = [
      assessment("2026-07-01T14:05:00+00:00", "watch", "normal", "watch", {
        gas_risk: { risk: 40, confidence: 0.9 },
      }),
      assessment("2026-07-01T14:09:00+00:00", "elevated", "watch", "elevated", {
        gas_risk: { risk: 60, confidence: 0.9 },
      }),
      assessment("2026-07-01T14:11:00+00:00", "critical", "elevated", "critical", {
        gas_risk: { risk: 90, confidence: 0.9 },
      }),
    ];

    const narrative = buildOperationalNarrative(timeline);

    expect(narrative).toHaveLength(3);
    expect(narrative[0].timestamp).toBe("2026-07-01T14:05:00+00:00");
    expect(narrative[1].sentence).toBe("Escalating - increased monitoring required.");
    expect(narrative[2].sentence).toBe("Shutdown recommended.");
  });

  it("collapses consecutive ticks that produce the identical sentence", () => {
    const flat = assessment("2026-07-01T14:00:00+00:00", "watch", "watch", "watch", {
      gas_risk: { risk: 40, confidence: 0.9 },
    });
    const timeline = [
      flat,
      { ...flat, assessment_id: "a2", timestamp: "2026-07-01T14:01:00+00:00" },
      { ...flat, assessment_id: "a3", timestamp: "2026-07-01T14:02:00+00:00" },
    ];

    const narrative = buildOperationalNarrative(timeline);

    expect(narrative).toHaveLength(1);
    expect(narrative[0].timestamp).toBe("2026-07-01T14:00:00+00:00");
  });

  it("returns an empty narrative for an empty timeline", () => {
    expect(buildOperationalNarrative([])).toEqual([]);
  });
});
