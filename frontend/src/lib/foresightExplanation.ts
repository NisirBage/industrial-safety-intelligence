import type { ForesightResult } from "../api/types";

/**
 * M25 Part 8 (Executive Insights) - business-language narration over
 * already-returned `ForesightResult` data (matched trajectory count,
 * projected risk/tier, early-warning "why", progression stages). A
 * template, not a model: the same result always produces the same
 * lines, and every clause names a real field the backend already
 * computed (`src/foresight/*`).
 *
 * Per this milestone's architectural principle, these lines are never
 * an operational recommendation of their own - they only narrate what
 * similar historical trajectories showed. This function deliberately
 * does NOT claim anything about whether "the current recommendation
 * aligns with historical intervention outcomes" (one of the
 * milestone's own example lines) - `ForesightResult` carries no
 * intervention-outcome data to ground that claim in, and inventing
 * one would violate this platform's anti-fabrication discipline.
 */
export function foresightExecutiveInsights(result: ForesightResult): string[] {
  const matchCount = result.matches.length;
  if (matchCount === 0) {
    return ["No similar historical trajectories were found to forecast from yet."];
  }

  const lines: string[] = [];

  const firstAvailable = result.forecast.find(
    (point) => point.projected_risk !== null && point.projected_tier !== null,
  );
  if (firstAvailable && firstAvailable.projected_risk !== null && firstAvailable.projected_tier) {
    const delta = firstAvailable.projected_risk - result.current_risk_score;
    const direction = delta > 0 ? "increased" : delta < 0 ? "decreased" : "held steady";
    const magnitude = Math.abs(delta).toFixed(0);
    lines.push(
      `Based on ${matchCount} similar historical trajector${matchCount === 1 ? "y" : "ies"}, risk ` +
        `typically ${direction}${delta !== 0 ? ` by ${magnitude} points` : ""} within the next ` +
        `${firstAvailable.horizon_minutes} minutes, reaching ${firstAvailable.projected_tier.toUpperCase()}.`,
    );
  }

  lines.push(result.early_warning.why);

  if (result.progression.likely_next_stage.tier) {
    lines.push(
      `Historically, ${result.progression.current_stage.label} most often leads to ` +
        `${result.progression.likely_next_stage.label} next.`,
    );
  }

  if (result.progression.expected_resolution.tier === "normal") {
    lines.push(result.progression.expected_resolution.evidence);
  }

  return lines;
}
