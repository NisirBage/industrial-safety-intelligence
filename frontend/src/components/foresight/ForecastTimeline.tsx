import type { ForecastPoint } from "../../api/types";
import { TierBadge } from "../common/TierBadge";

/**
 * M25 Part 4/9 (Forecast + Forecast timeline) - one entry per horizon
 * (15/30/60 min), each citing the matched incidents it was aggregated
 * from. A horizon with no matched historical data reaching it is
 * shown honestly as unavailable, never interpolated.
 */
export function ForecastTimeline({ forecast }: { forecast: ForecastPoint[] }) {
  return (
    <ol className="foresight-forecast-timeline">
      {forecast.map((point) => (
        <li key={point.horizon_minutes} className="foresight-forecast-node">
          <div className="foresight-forecast-node-header">
            <span className="foresight-forecast-node-horizon">+{point.horizon_minutes} min</span>
            {point.projected_tier ? (
              <>
                <TierBadge tier={point.projected_tier} />
                <span className="kpi-sub">{point.projected_risk?.toFixed(1)}</span>
              </>
            ) : (
              <span className="kpi-sub">Unavailable</span>
            )}
          </div>
          {point.unavailable_reason ? (
            <p className="kpi-sub">{point.unavailable_reason}</p>
          ) : (
            <p className="foresight-forecast-node-evidence">
              Cited from {point.evidence.length} matched incident(s):{" "}
              {point.evidence
                .map((item) => `${item.scenario_key} (${(item.similarity * 100).toFixed(0)}% similar)`)
                .join(", ")}
            </p>
          )}
        </li>
      ))}
    </ol>
  );
}
