import { useState } from "react";

import type { RiskAssessment } from "../../api/types";
import { QueryResult } from "../common/QueryResult";
import { DeckExplorer } from "../historical/DeckExplorer";
import { useForesightForecast } from "../../hooks/useForesightForecast";
import { foresightExecutiveInsights } from "../../lib/foresightExplanation";
import { ConfidenceFactors } from "./ConfidenceFactors";
import { EarlyWarningBanner } from "./EarlyWarningBanner";
import { ForecastTimeline } from "./ForecastTimeline";
import { ForecastTrajectoryChart } from "./ForecastTrajectoryChart";
import { IncidentProgressionLadder } from "./IncidentProgressionLadder";
import { MatchesAndDeckCoverage } from "./MatchesAndDeckCoverage";
import { OperationalStabilityGauge } from "./OperationalStabilityGauge";

/**
 * M25 - the "Operational Foresight Panel": trajectory-matched
 * forecast, confidence, incident progression, and early warning for
 * one zone/tick, all read-only evidence over historical trajectories.
 * Per this milestone's architectural principle, nothing here is a
 * recommendation of its own - the deterministic engine's own
 * `RecommendationList` (shown elsewhere on this page) remains the
 * sole source of "what to do now."
 */
export function OperationalForesightPanel({
  zoneId,
  timestamp,
  scenarioKey,
  currentTimeline,
}: {
  zoneId: string;
  timestamp: string;
  scenarioKey: string;
  currentTimeline: RiskAssessment[];
}) {
  const [selectedDeckKey, setSelectedDeckKey] = useState<string | undefined>(undefined);
  const { data, isLoading, error, refetch } = useForesightForecast(zoneId, timestamp, scenarioKey, {
    deckKey: selectedDeckKey,
  });

  const insights = data ? foresightExecutiveInsights(data) : [];
  const chartTimeline = currentTimeline.map((assessment) => ({
    timestamp: assessment.timestamp,
    risk: assessment.compound_risk_score,
  }));

  return (
    <div className="foresight-panel">
      <h3>Operational Foresight</h3>
      <p className="page-intro">
        Given similar historical trajectories, what is most likely to happen next - context and
        trend evidence only, never a recommendation of its own. The engine's own recommendations
        remain authoritative.
      </p>

      <DeckExplorer selectedDeckKey={selectedDeckKey} onSelectDeckKey={setSelectedDeckKey} />

      <QueryResult
        isLoading={isLoading}
        error={error}
        isEmpty={data !== undefined && data.matches.length === 0}
        emptyLabel="No similar historical trajectories found to forecast from yet."
        emptyHint="This can happen for the very first ticks of a scenario, before enough trailing history exists to match against."
        onRetry={() => void refetch()}
      >
        {data && (
          <>
            {insights.length > 0 && (
              <div className="card foresight-executive-insights">
                <h4>Executive Insights</h4>
                <ul>
                  {insights.map((line, index) => (
                    <li key={index}>{line}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="card">
              <h4>Trajectory & Forecast</h4>
              <ForecastTrajectoryChart
                currentTimeline={chartTimeline}
                nowTimestamp={data.timestamp}
                forecast={data.forecast}
              />
              <ForecastTimeline forecast={data.forecast} />
            </div>

            <div className="foresight-panel-grid">
              <div className="card">
                <h4>Confidence</h4>
                <ConfidenceFactors confidence={data.confidence} />
              </div>

              <div className="card">
                <h4>Early Warning</h4>
                <EarlyWarningBanner signal={data.early_warning} />
                <OperationalStabilityGauge
                  category={data.early_warning.category}
                  confidence={data.confidence}
                />
              </div>
            </div>

            <div className="card">
              <h4>Incident Progression</h4>
              <IncidentProgressionLadder progression={data.progression} />
            </div>

            <div className="card">
              <h4>Historical Overlays</h4>
              <MatchesAndDeckCoverage
                matches={data.matches}
                deckContributions={data.deck_contributions}
                confidence={data.confidence}
              />
            </div>
          </>
        )}
      </QueryResult>
    </div>
  );
}
