import type { RiskAssessment } from "../api/types";
import { parseJustification } from "./justification";

export interface TimelineEvent {
  timestamp: string;
  kind: "tier_change" | "critical" | "interaction_bonus" | "highest_risk";
  label: string;
}

/**
 * Item 6 (Operator Timeline) - live-mode equivalent of the Time
 * Machine's server-side bookmark detector (`src/services/replay.py::
 * _detect_bookmarks`), for the one case that detector doesn't cover:
 * there is no `/replay` window for "right now" in live mode, only a
 * per-zone history (`GET /risk/history/{zoneId}`). This is a lighter
 * subset (tier changes, critical entry, interaction-bonus onset, the
 * single highest-risk tick) of the same idea, written once here so
 * live and replay modes share one visual timeline component even
 * though they read from two different sources - `OperatorTimeline.tsx`
 * uses `replay.bookmarks` directly in replay mode instead of calling
 * this function, so the two detectors never have to agree bit-for-bit,
 * only in spirit. Every event name comes from fields the assessment
 * itself already carries (`tier`, `rules_fired`) - nothing here
 * recomputes risk or invents a category the frozen engine didn't
 * already decide.
 *
 * `assessments` must be ascending by timestamp.
 */
export function deriveTimelineEvents(assessments: RiskAssessment[]): TimelineEvent[] {
  const events: TimelineEvent[] = [];
  let previousTier: string | null = null;
  let previousBonusApplied = false;
  let highestScore = -Infinity;
  let highestIndex = -1;

  assessments.forEach((assessment, index) => {
    const justification = parseJustification(assessment.justification);
    const bonusApplied = justification?.rulesFired.includes("interaction_bonus_applied") ?? false;

    if (previousTier !== null && assessment.tier !== previousTier) {
      events.push({
        timestamp: assessment.timestamp,
        kind: "tier_change",
        label: `${previousTier.toUpperCase()} → ${assessment.tier.toUpperCase()}`,
      });
      if (assessment.tier === "critical") {
        events.push({
          timestamp: assessment.timestamp,
          kind: "critical",
          label: "Entered CRITICAL",
        });
      }
    }

    if (bonusApplied && !previousBonusApplied) {
      events.push({
        timestamp: assessment.timestamp,
        kind: "interaction_bonus",
        label: `Interaction bonus applied (×${justification?.interactionBonusApplied.toFixed(2)})`,
      });
    }

    if (assessment.compound_risk_score > highestScore) {
      highestScore = assessment.compound_risk_score;
      highestIndex = index;
    }

    previousTier = assessment.tier;
    previousBonusApplied = bonusApplied;
  });

  if (highestIndex >= 0) {
    const peak = assessments[highestIndex];
    events.push({
      timestamp: peak.timestamp,
      kind: "highest_risk",
      label: `Highest compound score this window: ${peak.compound_risk_score.toFixed(1)}`,
    });
  }

  return events.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
}
