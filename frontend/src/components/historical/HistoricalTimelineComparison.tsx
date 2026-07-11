import type { RiskAssessment } from "../../api/types";
import { TierBadge } from "../common/TierBadge";
import { LoadingState } from "../common/LoadingState";
import { ErrorState } from "../common/ErrorState";
import { useHistoricalReplayComparison } from "../../hooks/useHistoricalReplayComparison";

/**
 * M24 Part 7 (Historical Timeline) - the current replay's zone
 * timeline next to the matched historical incident's own zone
 * timeline (fetched via the existing `GET /replay`, not a new
 * endpoint), aligned by tick order rather than wall-clock time since
 * the two incidents happened at different real dates. Rows where the
 * tiers disagree are flagged as divergence points; the final row of
 * each column is that timeline's real outcome.
 */
export function HistoricalTimelineComparison({
  currentTimeline,
  historicalScenarioKey,
  historicalZoneId,
}: {
  currentTimeline: RiskAssessment[];
  historicalScenarioKey: string;
  historicalZoneId: string;
}) {
  const { data: historicalReplay, isLoading, error } = useHistoricalReplayComparison(
    historicalScenarioKey,
  );

  if (isLoading) {
    return <LoadingState label="Loading historical replay for comparison..." />;
  }
  if (error) {
    return <ErrorState error={error} />;
  }

  const historicalTimeline =
    historicalReplay?.zone_timelines.find((t) => t.zone_id === historicalZoneId)?.assessments ?? [];

  if (historicalTimeline.length === 0 || currentTimeline.length === 0) {
    return <p className="kpi-sub">Not enough persisted ticks on one side to compare timelines.</p>;
  }

  const rowCount = Math.max(currentTimeline.length, historicalTimeline.length);
  const rows = Array.from({ length: rowCount }, (_, index) => ({
    index,
    current: currentTimeline[index],
    historical: historicalTimeline[index],
  }));

  const currentOutcome = currentTimeline[currentTimeline.length - 1];
  const historicalOutcome = historicalTimeline[historicalTimeline.length - 1];

  return (
    <div className="historical-timeline-comparison">
      <div className="historical-timeline-comparison-header">
        <span>Current</span>
        <span>Historical ({historicalScenarioKey})</span>
      </div>
      <ol className="historical-timeline-comparison-list">
        {rows.map(({ index, current, historical }) => {
          const diverges = current && historical && current.tier !== historical.tier;
          return (
            <li
              key={index}
              className={`historical-timeline-comparison-row${diverges ? " historical-timeline-diverges" : ""}`}
            >
              <span className="historical-timeline-comparison-cell">
                {current ? (
                  <>
                    <TierBadge tier={current.tier} /> {current.compound_risk_score.toFixed(1)}
                  </>
                ) : (
                  <span className="kpi-sub">—</span>
                )}
              </span>
              <span className="historical-timeline-comparison-cell">
                {historical ? (
                  <>
                    <TierBadge tier={historical.tier} /> {historical.compound_risk_score.toFixed(1)}
                  </>
                ) : (
                  <span className="kpi-sub">—</span>
                )}
              </span>
            </li>
          );
        })}
      </ol>
      <div className="historical-timeline-comparison-outcome">
        <span>
          Current: <TierBadge tier={currentOutcome.tier} />
        </span>
        <span>&rarr;</span>
        <span>
          Historical outcome: <TierBadge tier={historicalOutcome.tier} />
        </span>
      </div>
    </div>
  );
}
