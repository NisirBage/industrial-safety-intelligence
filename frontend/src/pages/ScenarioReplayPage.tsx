import { useQueries } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";

import { getRiskHistory } from "../api/risk";
import type { RiskAssessment } from "../api/types";
import { QueryResult } from "../components/common/QueryResult";
import { TierBadge } from "../components/common/TierBadge";
import { PipelineDiagram } from "../components/explainability/PipelineDiagram";
import { RecommendationList } from "../components/explainability/RecommendationList";
import { PlantMap, type PlantMapZone } from "../components/plant/PlantMap";
import { RiskHistoryChart } from "../components/zone/RiskHistoryChart";
import { usePermits } from "../hooks/usePermits";
import { useAllZoneSensors } from "../hooks/useScenarioBuilder";
import { useScenario } from "../hooks/useScenarios";
import { useZoneCounterfactuals } from "../hooks/useZoneCounterfactuals";
import { useZoneWorkerCounts } from "../hooks/useZoneWorkerCounts";
import { useZones } from "../hooks/useZones";
import { averageCompoundScore } from "../lib/executiveKpis";
import { formatTimestamp, zoneLabel } from "../lib/format";
import { parseJustification } from "../lib/justification";
import { activePermitTypesForZone } from "../lib/permitIcons";
import { deriveRecommendations } from "../lib/recommendations";
import { assessmentAtOrBefore } from "../lib/timeline";
import { worstTier } from "../lib/tier";

const REPLAY_HISTORY_LIMIT = 500;
const SCRUB_STEPS = 200;
const PLAYBACK_TICK_MS = 300;
const SPEED_OPTIONS = [1, 2, 5, 10];

/** One `GET /risk/history/{zoneId}` per zone the scenario touches -
 * `useQueries` rather than a fixed number of `useRiskHistory` calls
 * because the zone count is only known once `useScenario` resolves,
 * and the rules of hooks forbid a variable number of hook calls. */
function useZoneHistories(zoneIds: string[]) {
  return useQueries({
    queries: zoneIds.map((zoneId) => ({
      queryKey: ["risk", "history", zoneId, { limit: REPLAY_HISTORY_LIMIT }],
      queryFn: () => getRiskHistory(zoneId, { limit: REPLAY_HISTORY_LIMIT }),
    })),
  });
}

/**
 * M11.2 (Live Incident Playback) - the same shared playhead DIL.4
 * introduced now drives every synchronized view at once: the plant
 * map, per-zone risk cards and charts, recommendations, and the
 * counterfactual comparison, all re-derived from the same
 * `currentTime` on every scrub/tick. Nothing here computes a risk
 * value; every number comes from an already-persisted assessment or
 * an on-demand counterfactual recomputation of the frozen, independent
 * Counterfactual Comparator (GET /counterfactual/{zoneId}).
 */
export function ScenarioReplayPage() {
  const { key } = useParams<{ key: string }>();
  const { data: scenario, isLoading, error } = useScenario(key);
  const { data: zones } = useZones();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const zoneIds = useMemo(() => scenario?.zone_ids ?? [], [scenario]);
  const histories = useZoneHistories(zoneIds);

  const startMs = scenario ? new Date(scenario.start_time).getTime() : 0;
  const endMs = scenario ? new Date(scenario.end_time).getTime() : 0;
  const stepMs = scenario ? Math.max(1000, Math.round((endMs - startMs) / SCRUB_STEPS)) : 1000;

  const [currentTime, setCurrentTime] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);

  useEffect(() => {
    if (scenario) {
      setCurrentTime(new Date(scenario.start_time).getTime());
      setPlaying(searchParams.get("autoplay") === "1");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scenario]);

  useEffect(() => {
    if (!playing || currentTime === null) {
      return;
    }
    const id = window.setInterval(() => {
      setCurrentTime((time) => {
        if (time === null) {
          return time;
        }
        const next = time + stepMs * speed;
        if (next >= endMs) {
          setPlaying(false);
          return endMs;
        }
        return next;
      });
    }, PLAYBACK_TICK_MS);
    return () => window.clearInterval(id);
  }, [playing, currentTime, stepMs, speed, endMs]);

  const isLoadingHistories = histories.some((query) => query.isLoading);
  const historiesError = histories.find((query) => query.error)?.error;

  const zoneTimelines = useMemo(
    () =>
      zoneIds.map((zoneId, index) => {
        const items = histories[index]?.data?.items ?? [];
        // Newest-first, matching what the backend returns - RiskHistoryChart
        // reverses this itself, and assessmentAtOrBefore doesn't care about order.
        const inWindow = items.filter((item) => {
          const t = new Date(item.timestamp).getTime();
          return t >= startMs && t <= endMs;
        });
        const atCursor: RiskAssessment | null =
          currentTime !== null ? assessmentAtOrBefore(inWindow, currentTime) : null;
        return { zoneId, inWindow, atCursor };
      }),
    [zoneIds, histories, startMs, endMs, currentTime],
  );

  const counterfactuals = useZoneCounterfactuals(
    zoneTimelines.map(({ zoneId, atCursor }) => ({
      zoneId,
      timestamp: atCursor?.timestamp ?? null,
    })),
  );

  const workerCounts = useZoneWorkerCounts(zoneIds);
  const zoneSensors = useAllZoneSensors(zoneIds);
  const { data: activePermits } = usePermits({ status: "active" });

  const assessmentsAtCursor = zoneTimelines
    .map(({ atCursor }) => atCursor)
    .filter((assessment): assessment is RiskAssessment => assessment !== null);

  /** M12.2 (Digital Twin) - the "Executive dashboard" dimension of the
   * synchronized replay: plant-wide worst tier and average score
   * across every zone, re-derived from the same `atCursor` values the
   * plant map and per-zone cards below already use, on every scrub. */
  const twinPlantTier = worstTier(assessmentsAtCursor.map((assessment) => assessment.tier));
  const twinAverageScore = averageCompoundScore(assessmentsAtCursor);

  const mapZones: PlantMapZone[] = zoneTimelines
    .map(({ zoneId, atCursor }, index) => {
      if (atCursor === null) {
        return null;
      }
      const justification = parseJustification(atCursor.justification);
      const zone: PlantMapZone = {
        zoneId,
        name: zoneLabel(zoneId, zones),
        tier: atCursor.tier,
        compoundRiskScore: atCursor.compound_risk_score,
        confidence: atCursor.confidence,
        timestamp: atCursor.timestamp,
        workerCount: workerCounts[index]?.data?.worker_count,
        activePermitTypes: activePermitTypesForZone(activePermits?.items ?? [], zoneId),
        equipmentRisk: justification?.agentContributions.equipment_status?.risk,
        gasRisk: justification?.agentContributions.gas_risk?.risk,
        gasType: zoneSensors[index]?.data?.[0]?.gas_type,
      };
      return zone;
    })
    .filter((zone): zone is PlantMapZone => zone !== null);

  return (
    <section>
      <p>
        <Link to="/scenarios">&larr; Scenario library</Link>
      </p>
      <QueryResult
        isLoading={isLoading}
        error={error}
        isEmpty={!scenario}
        emptyLabel="Scenario not found."
      >
        {scenario && (
          <>
            <h1>{scenario.title}</h1>
            <p className="page-intro">{scenario.description}</p>
            <div className="card twin-summary-strip">
              <span>
                Plant status: {twinPlantTier ? <TierBadge tier={twinPlantTier} /> : "—"}
              </span>
              <span>Average compound score: {twinAverageScore.toFixed(1)}</span>
              <span>Zones in this scenario: {zoneIds.length}</span>
              <Link to="/executive">Full Executive Overview &rarr;</Link>
            </div>
            <p>
              {formatTimestamp(scenario.start_time)} &ndash; {formatTimestamp(scenario.end_time)}
            </p>

            <div className="card" style={{ margin: "1rem 0" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
                <button
                  type="button"
                  onClick={() => setPlaying((p) => !p)}
                  disabled={currentTime === endMs}
                >
                  {playing ? "Pause" : "Play"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPlaying(false);
                    setCurrentTime(startMs);
                  }}
                >
                  Reset
                </button>
                <label>
                  Speed:{" "}
                  <select value={speed} onChange={(event) => setSpeed(Number(event.target.value))}>
                    {SPEED_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}x
                      </option>
                    ))}
                  </select>
                </label>
                <input
                  type="range"
                  min={startMs}
                  max={endMs}
                  step={stepMs}
                  value={currentTime ?? startMs}
                  onChange={(event) => {
                    setPlaying(false);
                    setCurrentTime(Number(event.target.value));
                  }}
                  style={{ flex: 1, minWidth: "150px" }}
                />
                <span>{currentTime !== null ? formatTimestamp(new Date(currentTime).toISOString()) : ""}</span>
              </div>
            </div>

            <QueryResult
              isLoading={isLoadingHistories}
              error={historiesError}
              isEmpty={zoneTimelines.every((zone) => zone.inWindow.length === 0)}
              emptyLabel="No persisted risk history for this scenario's zones yet."
            >
              <div style={{ marginBottom: "1rem" }}>
                <PlantMap zones={mapZones} onZoneClick={(zoneId) => navigate(`/zones/${zoneId}`)} />
              </div>

              <div className="card-grid">
                {zoneTimelines.map(({ zoneId, inWindow, atCursor }, index) => {
                  const justification = atCursor ? parseJustification(atCursor.justification) : null;
                  const recommendations = atCursor
                    ? deriveRecommendations(atCursor.tier, justification)
                    : [];
                  const counterfactual = counterfactuals[index]?.data;

                  return (
                    <div key={zoneId} className="card">
                      <h3>{zoneLabel(zoneId, zones)}</h3>
                      {atCursor ? (
                        <p>
                          {atCursor.compound_risk_score.toFixed(1)} <TierBadge tier={atCursor.tier} />{" "}
                          <Link to={`/explain/${atCursor.assessment_id}`}>Explain &rarr;</Link>
                        </p>
                      ) : (
                        <p>No assessment yet at this point in the timeline.</p>
                      )}
                      <RiskHistoryChart history={inWindow} />

                      {atCursor && (
                        <>
                          <h4>Pipeline</h4>
                          <PipelineDiagram assessment={atCursor} justification={justification} />
                        </>
                      )}

                      {recommendations.length > 0 && (
                        <>
                          <h4>Recommended Actions</h4>
                          <RecommendationList recommendations={recommendations} />
                        </>
                      )}

                      {counterfactual && (
                        <>
                          <h4>Naive Baseline</h4>
                          <p>
                            {counterfactual.counterfactual.alert ? "ALERT" : "CLEAR"}
                            {atCursor && atCursor.tier !== "normal" && !counterfactual.counterfactual.alert && (
                              <span> &middot; naive system misses this escalation</span>
                            )}
                          </p>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </QueryResult>
          </>
        )}
      </QueryResult>
    </section>
  );
}
