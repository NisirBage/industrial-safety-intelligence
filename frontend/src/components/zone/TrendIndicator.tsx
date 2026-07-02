/**
 * Compares two already-computed `compound_risk_score` values and
 * shows which direction the trend moved - a comparison, not a new
 * risk calculation. Never invents an intermediate value.
 */
export function TrendIndicator({
  current,
  previous,
}: {
  current: number;
  previous: number | undefined;
}) {
  if (previous === undefined) {
    return <span className="trend-flat">—</span>;
  }
  if (current > previous) {
    return <span className="trend-up">▲ rising</span>;
  }
  if (current < previous) {
    return <span className="trend-down">▼ falling</span>;
  }
  return <span className="trend-flat">▬ steady</span>;
}
