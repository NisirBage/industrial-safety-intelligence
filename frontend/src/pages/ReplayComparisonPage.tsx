import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import type { ScenarioSummary } from "../api/types";
import { QueryResult } from "../components/common/QueryResult";
import { TierBadge } from "../components/common/TierBadge";
import { useForesightForecast } from "../hooks/useForesightForecast";
import { useHistoricalMatches } from "../hooks/useHistoricalMatches";
import { useRiskHistory } from "../hooks/useRiskHistory";
import { useScenario, useScenarios } from "../hooks/useScenarios";
import { useZones } from "../hooks/useZones";
import { formatTimestamp, zoneLabel } from "../lib/format";
import { parseJustification } from "../lib/justification";
import { deriveRecommendations } from "../lib/recommendations";
import { timeAtFraction } from "../lib/replayComparison";
import { assessmentAtOrBefore } from "../lib/timeline";

const HISTORY_LIMIT = 500;
const SCRUB_STEPS = 200;
const PLAYBACK_TICK_MS = 300;
const SPEED_OPTIONS = [1, 2, 5, 10];

function ScenarioZoneSelect({
  label,
  scenarios,
  scenarioKey,
  zoneId,
  onScenarioChange,
  onZoneChange,
  scenario,
}: {
  label: string;
  scenarios: ScenarioSummary[];
  scenarioKey: string;
  zoneId: string;
  onScenarioChange: (key: string) => void;
  onZoneChange: (zoneId: string) => void;
  scenario: ScenarioSummary | undefined;
}) {
  const { data: zones } = useZones();
  return (
    <div className="replay-comparison-picker">
      <label>
        {label} scenario
        <select value={scenarioKey} onChange={(event) => onScenarioChange(event.target.value)}>
          {scenarios.map((s) => (
            <option key={s.key} value={s.key}>
              {s.title}
            </option>
          ))}
        </select>
      </label>
      <label>
        Zone
        <select value={zoneId} onChange={(event) => onZoneChange(event.target.value)}>
          {(scenario?.zone_ids ?? []).map((id) => (
            <option key={id} value={id}>
              {zoneLabel(id, zones)}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

function ComparisonSidePanel({
  title,
  scenario,
  zoneId,
  fraction,
}: {
  title: string;
  scenario: ScenarioSummary | undefined;
  zoneId: string;
  fraction: number;
}) {
  const { data: zones } = useZones();
  const { data: history } = useRiskHistory(zoneId, { limit: HISTORY_LIMIT });

  const atTime = scenario ? timeAtFraction(scenario.start_time, scenario.end_time, fraction) : null;
  const inWindow = (history?.items ?? []).filter((item) => {
    if (!scenario) {
      return false;
    }
    const t = new Date(item.timestamp).getTime();
    return t >= new Date(scenario.start_time).getTime() && t <= new Date(scenario.end_time).getTime();
  });
  const atCursor = atTime !== null ? assessmentAtOrBefore(inWindow, atTime) : null;

  const justification = atCursor ? parseJustification(atCursor.justification) : null;
  const recommendations = atCursor ? deriveRecommendations(atCursor.tier, justification) : [];

  const { data: historicalMatches } = useHistoricalMatches(zoneId, atCursor?.timestamp);
  const bestMatch = historicalMatches?.matches[0];

  const { data: foresight } = useForesightForecast(zoneId, atCursor?.timestamp, scenario?.key);

  return (
    <div className="card replay-comparison-side">
      <h3>{title}</h3>
      {scenario && <p className="kpi-sub">{scenario.title}</p>}
      {atCursor ? (
        <>
          <p>
            {zoneLabel(zoneId, zones)} &middot; {formatTimestamp(atCursor.timestamp)}
          </p>
          <p className="replay-comparison-risk">
            <TierBadge tier={atCursor.tier} /> {atCursor.compound_risk_score.toFixed(1)}
          </p>
          <h4>Forecast</h4>
          <p>
            {foresight
              ? `${foresight.early_warning.category} - ${foresight.early_warning.why}`
              : "No forecast computed for this tick."}
          </p>
          <h4>Recommendation</h4>
          <p>{recommendations[0]?.text ?? "No recommended action."}</p>
          <h4>Business Impact</h4>
          <p>{bestMatch ? bestMatch.business_impact : "No comparable historical incident."}</p>
        </>
      ) : (
        <p>No data yet at this point in the replay.</p>
      )}
    </div>
  );
}

/**
 * M28 Part 4 (Replay Comparison Mode) - the current incident and a
 * historical incident, side by side, scrubbing together by relative
 * progress through each incident's own real duration
 * (`lib/replayComparison.ts::timeAtFraction`). Every value shown for
 * either side is the exact same already-persisted/already-computed
 * data every other page in this app reads (`RiskAssessment`,
 * `deriveRecommendations`, historical matches, Operational
 * Foresight) - this page recomputes nothing, it only shows two real
 * incidents at the same relative moment instead of one.
 */
export function ReplayComparisonPage() {
  const { data: scenarios, isLoading, error } = useScenarios();

  const [currentKey, setCurrentKey] = useState<string>("");
  const [currentZoneId, setCurrentZoneId] = useState<string>("");
  const [historicalKey, setHistoricalKey] = useState<string>("");
  const [historicalZoneId, setHistoricalZoneId] = useState<string>("");

  useEffect(() => {
    if (scenarios && scenarios.length > 0 && currentKey === "") {
      setCurrentKey(scenarios[0].key);
      setCurrentZoneId(scenarios[0].zone_ids[0] ?? "");
    }
    if (scenarios && scenarios.length > 1 && historicalKey === "") {
      setHistoricalKey(scenarios[1].key);
      setHistoricalZoneId(scenarios[1].zone_ids[0] ?? "");
    } else if (scenarios && scenarios.length === 1 && historicalKey === "") {
      setHistoricalKey(scenarios[0].key);
      setHistoricalZoneId(scenarios[0].zone_ids[0] ?? "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scenarios]);

  const { data: currentScenario } = useScenario(currentKey || undefined);
  const { data: historicalScenario } = useScenario(historicalKey || undefined);

  const [fraction, setFraction] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);

  useEffect(() => {
    if (!playing) {
      return;
    }
    const id = window.setInterval(() => {
      setFraction((f) => {
        const next = f + (speed * 1) / SCRUB_STEPS;
        if (next >= 1) {
          setPlaying(false);
          return 1;
        }
        return next;
      });
    }, PLAYBACK_TICK_MS);
    return () => window.clearInterval(id);
  }, [playing, speed]);

  return (
    <section>
      <h1>Replay Comparison</h1>
      <p className="page-intro">
        Current incident vs. a historical incident, scrubbed together by relative progress through
        each one's own real duration - every value on both sides is real, already-persisted data.
      </p>

      <QueryResult
        isLoading={isLoading}
        error={error}
        isEmpty={!scenarios || scenarios.length === 0}
        emptyLabel="No scenarios cataloged."
      >
        <div className="card replay-comparison-controls">
          <ScenarioZoneSelect
            label="Current"
            scenarios={scenarios ?? []}
            scenarioKey={currentKey}
            zoneId={currentZoneId}
            scenario={currentScenario}
            onScenarioChange={(key) => {
              setCurrentKey(key);
              const s = scenarios?.find((sc) => sc.key === key);
              setCurrentZoneId(s?.zone_ids[0] ?? "");
            }}
            onZoneChange={setCurrentZoneId}
          />
          <ScenarioZoneSelect
            label="Historical"
            scenarios={scenarios ?? []}
            scenarioKey={historicalKey}
            zoneId={historicalZoneId}
            scenario={historicalScenario}
            onScenarioChange={(key) => {
              setHistoricalKey(key);
              const s = scenarios?.find((sc) => sc.key === key);
              setHistoricalZoneId(s?.zone_ids[0] ?? "");
            }}
            onZoneChange={setHistoricalZoneId}
          />

          <div className="replay-comparison-scrubber">
            <button type="button" onClick={() => setPlaying((p) => !p)}>
              {playing ? "Pause" : "Play"}
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={1 / SCRUB_STEPS}
              value={fraction}
              onChange={(event) => setFraction(Number(event.target.value))}
              aria-label="Replay comparison progress"
            />
            <span>{(fraction * 100).toFixed(0)}%</span>
            <label>
              Speed
              <select value={speed} onChange={(event) => setSpeed(Number(event.target.value))}>
                {SPEED_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s}x
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        <div className="replay-comparison-grid">
          <ComparisonSidePanel
            title="Current Incident"
            scenario={currentScenario}
            zoneId={currentZoneId}
            fraction={fraction}
          />
          <ComparisonSidePanel
            title="Historical Incident"
            scenario={historicalScenario}
            zoneId={historicalZoneId}
            fraction={fraction}
          />
        </div>

        <p>
          <Link to="/knowledge-graph">Explore the Knowledge Graph &rarr;</Link>
        </p>
      </QueryResult>
    </section>
  );
}
