import { useMemo } from "react";

import { QueryResult } from "../components/common/QueryResult";
import { TierBadge } from "../components/common/TierBadge";
import { PlantMap, type PlantMapZone } from "../components/plant/PlantMap";
import { ReplayController } from "../components/replay/ReplayController";
import { useReplay } from "../context/ReplayContext";
import { usePermits } from "../hooks/usePermits";
import { useScenarios } from "../hooks/useScenarios";
import { useZoneWorkerCounts } from "../hooks/useZoneWorkerCounts";
import { useZones } from "../hooks/useZones";
import { formatTimestamp, zoneLabel } from "../lib/format";
import { parseJustification } from "../lib/justification";
import { activePermitTypesForZone } from "../lib/permitIcons";
import { assessmentAtOrBefore } from "../lib/timeline";
import { tierRank } from "../lib/tier";

/** Duplicates `TimeMachinePage`'s own scenario-launch button, kept as
 * an independent copy the same way every other small shared block in
 * this codebase is - this page's entry point is deliberately minimal
 * (no full library grid), just enough to hand a target to the one
 * shared `ReplayContext`. */
function ScenarioLauncher() {
  const { data: scenarios, isLoading, error } = useScenarios();
  const replay = useReplay();

  return (
    <QueryResult
      isLoading={isLoading}
      error={error}
      isEmpty={(scenarios ?? []).length === 0}
      emptyLabel="No scenarios in the library yet."
      emptyHint="Author one in the Scenario Builder to get a replay to demo."
      emptyAction={{ label: "Go to Scenario Builder", to: "/scenario-builder" }}
    >
      <div className="card-grid">
        {(scenarios ?? []).map((scenario) => (
          <button
            key={scenario.key}
            type="button"
            className="card"
            style={{ textAlign: "left", cursor: "pointer" }}
            onClick={() => replay.startReplay({ scenarioKey: scenario.key })}
          >
            <h3>{scenario.title}</h3>
            <p>{scenario.description}</p>
          </button>
        ))}
      </div>
    </QueryResult>
  );
}

interface TimelineEvent {
  index: number;
  timestamp: string;
  zoneId: string | null;
  zoneName: string;
  tier: string | null;
  score: number | null;
}

/**
 * M20 Part 2 (Live Demo Timeline) - the exact same `ReplayContext`
 * every other replay-aware page reads, presented as a row of animated
 * event cards (one per tick, current one highlighted) instead of a
 * technical scrub slider. `ReplayController` (already built for Time
 * Machine) supplies Play/Pause/Step/Restart/Jump/Speed - nothing here
 * duplicates that logic, this page only adds the visual card layer and
 * a live-synced Digital Twin so each event is visibly happening
 * somewhere on the plant, not just a number changing.
 */
export function DemoTimelinePage() {
  const replay = useReplay();
  const { data: zones } = useZones();
  const { data: activePermits } = usePermits({ status: "active" });
  const workerCounts = useZoneWorkerCounts(replay.zoneIds);

  const events: TimelineEvent[] = useMemo(() => {
    return replay.allTimestamps.map((timestamp, index) => {
      const atTime = new Date(timestamp).getTime();
      let worstZoneId: string | null = null;
      let worst: ReturnType<typeof assessmentAtOrBefore> = null;
      for (const zoneId of replay.zoneIds) {
        const candidate = assessmentAtOrBefore(replay.zoneTimeline(zoneId), atTime);
        if (candidate && (!worst || tierRank(candidate.tier) > tierRank(worst.tier))) {
          worst = candidate;
          worstZoneId = zoneId;
        }
      }
      return {
        index,
        timestamp,
        zoneId: worstZoneId,
        zoneName: worstZoneId ? zoneLabel(worstZoneId, zones) : "—",
        tier: worst?.tier ?? null,
        score: worst?.compound_risk_score ?? null,
      };
    });
  }, [replay, zones]);

  const mapZones: PlantMapZone[] = replay.zoneIds
    .map((zoneId, index) => {
      const assessment = replay.assessmentAt(zoneId);
      if (!assessment) {
        return null;
      }
      const justification = parseJustification(assessment.justification);
      const zone: PlantMapZone = {
        zoneId,
        name: zoneLabel(zoneId, zones),
        tier: assessment.tier,
        compoundRiskScore: assessment.compound_risk_score,
        confidence: assessment.confidence,
        timestamp: assessment.timestamp,
        workerCount: workerCounts[index]?.data?.worker_count,
        activePermitTypes: activePermitTypesForZone(activePermits?.items ?? [], zoneId),
        equipmentRisk: justification?.agentContributions.equipment_status?.risk,
        gasRisk: justification?.agentContributions.gas_risk?.risk,
      };
      return zone;
    })
    .filter((zone): zone is PlantMapZone => zone !== null);

  const currentEvent = events[replay.currentIndex];

  return (
    <section className="demo-timeline-page">
      <h1>Live Demo Timeline</h1>
      <p className="page-intro">
        Step through a scenario tick by tick - every card below is a real persisted moment, not a
        scripted animation. Play it end to end, or jump straight to the moment that matters.
      </p>

      {replay.target === null ? (
        <>
          <p className="page-intro">Pick a scenario to start the timeline.</p>
          <ScenarioLauncher />
        </>
      ) : (
        <QueryResult
          isLoading={replay.isLoading}
          error={replay.error}
          isEmpty={replay.allTimestamps.length === 0}
          emptyLabel="This replay has no persisted assessments yet."
        >
          <ReplayController />

          <h2 className="section-heading">Timeline</h2>
          <ol className="demo-timeline-strip" aria-label="Replay events">
            {events.map((event) => (
              <li key={event.timestamp}>
                <button
                  type="button"
                  className={`demo-timeline-card${event.index === replay.currentIndex ? " demo-timeline-card-current" : ""}`}
                  onClick={() => replay.scrubToIndex(event.index)}
                  aria-current={event.index === replay.currentIndex}
                >
                  <span className="demo-timeline-card-tick">Tick {event.index + 1}</span>
                  <span className="demo-timeline-card-time">{formatTimestamp(event.timestamp)}</span>
                  {event.tier && (
                    <>
                      <TierBadge tier={event.tier} />
                      <span className="demo-timeline-card-zone">{event.zoneName}</span>
                      <span className="kpi-sub">{event.score?.toFixed(1)}</span>
                    </>
                  )}
                </button>
              </li>
            ))}
          </ol>

          <h2 className="section-heading">Digital Twin at this tick</h2>
          <div className="card demo-timeline-twin">
            <PlantMap
              zones={mapZones}
              showLegend
              selectedZoneId={currentEvent?.zoneId ?? null}
            />
          </div>
        </QueryResult>
      )}
    </section>
  );
}
