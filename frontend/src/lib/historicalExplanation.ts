import type { IncidentMatch } from "../api/types";

/**
 * M24 Part 8 (Executive Insights) - business-language narration over
 * already-returned `IncidentMatch` data (similarity score, root cause,
 * lessons learned). A template, not a model: the same matches always
 * produce the same lines, and every clause names a real field the
 * backend already computed (`src/historical/knowledge_base.py`).
 *
 * Per this milestone's architectural principle, these lines are never
 * an operational recommendation of their own - they only narrate what
 * a similar past incident showed. The deterministic engine's own
 * `RecommendationList` (lib/recommendations.ts) remains the sole
 * source of "what to do now."
 */
export function historicalExecutiveInsights(matches: IncidentMatch[]): string[] {
  if (matches.length === 0) {
    return [];
  }

  const lines: string[] = [];
  const top = matches[0];

  lines.push(
    `This assessment closely resembles ${top.incident_name} (${(top.similarity * 100).toFixed(0)}% similarity, ${top.outcome_tier.toUpperCase()} outcome).`,
  );

  if (top.lessons_learned.length > 0) {
    lines.push(`In that incident: ${top.lessons_learned[0].lesson}`);
  }

  if (top.matching_features.length > 0) {
    lines.push(
      `Matches on ${top.matching_features.length} of ${
        top.matching_features.length + top.differing_features.length
      } compared features, including ${top.matching_features.slice(0, 3).join(", ")}.`,
    );
  }

  if (matches.length > 1) {
    const otherOutcomes = new Set(matches.slice(1).map((m) => m.outcome_tier));
    lines.push(
      `${matches.length - 1} other similar incident${matches.length - 1 === 1 ? "" : "s"} on record` +
        (otherOutcomes.size > 0 ? `, reaching ${Array.from(otherOutcomes).join(", ").toUpperCase()}.` : "."),
    );
  }

  return lines;
}
