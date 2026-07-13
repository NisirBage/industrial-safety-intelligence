import { useState } from "react";

import type { RiskAssessment } from "../../api/types";
import { QueryResult } from "../common/QueryResult";
import { useHistoricalDecks } from "../../hooks/useHistoricalDecks";
import { useHistoricalMatches } from "../../hooks/useHistoricalMatches";
import { historicalExecutiveInsights } from "../../lib/historicalExplanation";
import { CrossScenarioAnalyticsPanel } from "./CrossScenarioAnalyticsPanel";
import { DeckExplorer } from "./DeckExplorer";
import { HistoricalTimelineComparison } from "./HistoricalTimelineComparison";
import { IncidentMatchCard } from "./IncidentMatchCard";

/**
 * M24 Part 8/10 - the "Historical Intelligence Panel": the single
 * place every Historical Intelligence surface (deck explorer, top-5
 * incident matches with lessons learned, business-language executive
 * insights, historical-vs-current timeline comparison, cross-scenario
 * analytics) is assembled for one zone/tick. Per this milestone's
 * architectural principle, everything here is *context* about similar
 * past incidents - it never recommends an action of its own. The
 * deterministic engine's own `RecommendationList` remains the sole
 * source of "what to do now."
 */
export function HistoricalIntelligencePanel({
  zoneId,
  timestamp,
  currentTimeline,
}: {
  zoneId: string;
  timestamp: string;
  currentTimeline: RiskAssessment[];
}) {
  const [selectedDeckKey, setSelectedDeckKey] = useState<string | undefined>(undefined);
  const { data, isLoading, error, refetch } = useHistoricalMatches(zoneId, timestamp, {
    topN: 5,
    deckKey: selectedDeckKey,
  });
  const { data: decks } = useHistoricalDecks();

  const matches = data?.matches ?? [];
  const insights = historicalExecutiveInsights(matches);
  const topMatch = matches[0];

  const selectedDeck = decks?.find((deck) => deck.key === selectedDeckKey);
  const isRoadmapDeck = selectedDeck !== undefined && selectedDeck.incidents.length === 0;

  return (
    <div className="historical-intelligence-panel">
      <h3>Historical Intelligence</h3>
      <p className="page-intro">
        Similar past incidents on this platform's own operational memory - context only, never a
        recommendation of its own. The engine's own recommendations above remain authoritative.
      </p>

      <DeckExplorer selectedDeckKey={selectedDeckKey} onSelectDeckKey={setSelectedDeckKey} />

      <QueryResult
        isLoading={isLoading}
        error={error}
        isEmpty={matches.length === 0}
        emptyLabel={
          isRoadmapDeck
            ? `No historical incidents for ${selectedDeck?.name} yet.`
            : "No similar historical incidents found for this assessment."
        }
        emptyHint={
          isRoadmapDeck
            ? "Structure supported - no incident data modeled yet for this industry deck."
            : "This can happen for the very first tick of a scenario, before any history exists to compare against."
        }
        onRetry={() => void refetch()}
      >
        {insights.length > 0 && (
          <div className="card historical-executive-insights">
            <h4>Executive Insights</h4>
            <ul>
              {insights.map((line, index) => (
                <li key={index}>{line}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="historical-match-grid">
          {matches.map((match, index) => (
            <IncidentMatchCard key={`${match.scenario_key}-${match.evidence_source}`} match={match} rank={index + 1} />
          ))}
        </div>

        {topMatch && (
          <div className="card historical-timeline-section">
            <h4>Current vs. Historical Timeline</h4>
            <HistoricalTimelineComparison
              currentTimeline={currentTimeline}
              historicalScenarioKey={topMatch.scenario_key}
              historicalZoneId={topMatch.zone_id}
            />
          </div>
        )}
      </QueryResult>

      <CrossScenarioAnalyticsPanel deckKey={selectedDeckKey} />
    </div>
  );
}
