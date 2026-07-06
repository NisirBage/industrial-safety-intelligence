import { useQueries } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { getRiskHistory } from "../api/risk";
import type { Tier } from "../api/types";
import { AgentContributionChart } from "../components/explainability/AgentContributionChart";
import { RecommendationList } from "../components/explainability/RecommendationList";
import { RulesFiredList } from "../components/explainability/RulesFiredList";
import { QueryResult } from "../components/common/QueryResult";
import { TierBadge } from "../components/common/TierBadge";
import { useReplay } from "../context/ReplayContext";
import { useZones } from "../hooks/useZones";
import { formatTimestamp, zoneLabel } from "../lib/format";
import {
  filterJournalEntries,
  sortJournalEntriesByTimestampDesc,
  type JournalEntry,
} from "../lib/decisionJournal";
import { parseJustification } from "../lib/justification";
import { deriveRecommendations } from "../lib/recommendations";

const JOURNAL_HISTORY_LIMIT = 100;
const TIER_OPTIONS: Tier[] = ["normal", "watch", "elevated", "critical"];

function useAllZoneHistories(zoneIds: string[]) {
  return useQueries({
    queries: zoneIds.map((zoneId) => ({
      queryKey: ["risk", "history", zoneId, { limit: JOURNAL_HISTORY_LIMIT }],
      queryFn: () => getRiskHistory(zoneId, { limit: JOURNAL_HISTORY_LIMIT }),
    })),
  });
}

function JournalEntryRow({
  entry,
  zones,
  expanded,
  onToggle,
}: {
  entry: JournalEntry;
  zones: ReturnType<typeof useZones>["data"];
  expanded: boolean;
  onToggle: () => void;
}) {
  const { zoneId, assessment } = entry;
  const justification = parseJustification(assessment.justification);
  const recommendations = deriveRecommendations(assessment.tier, justification);

  return (
    <div className="card journal-entry">
      <button type="button" className="journal-entry-header" onClick={onToggle}>
        <span>{formatTimestamp(assessment.timestamp)}</span>
        <span>{zoneLabel(zoneId, zones)}</span>
        <TierBadge tier={assessment.tier} />
        <span>{assessment.compound_risk_score.toFixed(1)}</span>
        <span aria-hidden="true">{expanded ? "▲" : "▼"}</span>
      </button>
      {expanded && (
        <div className="journal-entry-details">
          <p>Confidence: {(assessment.confidence * 100).toFixed(0)}%</p>
          {justification ? (
            <>
              <p>Interaction bonus applied: {justification.interactionBonusApplied.toFixed(2)}</p>
              <h4>Decision Contributors</h4>
              <AgentContributionChart contributions={justification.agentContributions} />
              <h4>Rules Fired</h4>
              <RulesFiredList rules={justification.rulesFired} />
            </>
          ) : (
            <p>This assessment&apos;s justification doesn&apos;t match the expected schema.</p>
          )}
          <h4>Recommended Actions</h4>
          <RecommendationList recommendations={recommendations} />
          <p>
            <Link to={`/explain/${assessment.assessment_id}`}>Full explainability view &rarr;</Link>
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * Item 3 (Decision Journal) - a single, searchable, filterable
 * chronological timeline of every persisted assessment across every
 * zone (`GET /risk/history/{zoneId}` for each zone in `GET /zones`).
 * Every field an entry expands to show comes straight from that row's
 * own `justification` column; nothing here recomputes anything.
 *
 * M23 Part 2 - dual-mode like the other replay-aware pages: when a
 * Time Machine replay is active, the journal shows only that replay's
 * own zones and only the entries up to the replay cursor (via
 * `ReplayContext.zoneTimeline`), so it grows in step as you scrub the
 * Time Slider instead of showing the whole system's unrelated history.
 * Outside a replay it's unchanged - every zone's full persisted
 * history via live queries, same as before.
 */
export function DecisionJournalPage() {
  const replay = useReplay();
  const isReplayMode = replay.target !== null;

  const { data: zones, isLoading: zonesLoading, error: zonesError } = useZones();
  const liveZoneIds = useMemo(() => (zones ?? []).map((zone) => zone.zone_id), [zones]);
  const zoneIds = isReplayMode ? replay.zoneIds : liveZoneIds;
  const histories = useAllZoneHistories(isReplayMode ? [] : zoneIds);

  const [tierFilter, setTierFilter] = useState<Tier | "">("");
  const [zoneFilter, setZoneFilter] = useState("");
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const isLoadingHistories = isReplayMode
    ? replay.isLoading
    : zonesLoading || histories.some((query) => query.isLoading);
  const historiesError = isReplayMode ? replay.error : histories.find((query) => query.error)?.error;

  let allEntries: JournalEntry[];
  if (isReplayMode) {
    const cursorTimestamp = replay.currentTimestamp;
    allEntries =
      cursorTimestamp === null
        ? []
        : zoneIds.flatMap((zoneId) =>
            replay
              .zoneTimeline(zoneId)
              .filter((assessment) => assessment.timestamp <= cursorTimestamp)
              .map((assessment) => ({ zoneId, assessment })),
          );
  } else {
    allEntries = zoneIds.flatMap((zoneId, index) => {
      const items = histories[index]?.data?.items ?? [];
      return items.map((assessment) => ({ zoneId, assessment }));
    });
  }

  const filtered = filterJournalEntries(sortJournalEntriesByTimestampDesc(allEntries), zones, {
    tier: tierFilter || undefined,
    zoneId: zoneFilter || undefined,
    search,
  });

  return (
    <section>
      <h1>Decision Journal</h1>
      <p className="page-intro">
        Every persisted assessment, across every zone, in one searchable timeline - expand an
        entry for the full rules-fired/agent-contribution/recommendation breakdown.
      </p>

      {isReplayMode && (
        <p className="digital-twin-replay-banner">
          Showing this Time Machine replay's decisions up to the current cursor, not the whole
          system's history. <Link to="/time-machine">Open Time Machine controls &rarr;</Link>
        </p>
      )}

      <div className="filters">
        <label>
          Zone:{" "}
          <select value={zoneFilter} onChange={(event) => setZoneFilter(event.target.value)}>
            <option value="">All zones</option>
            {(zones ?? []).map((zone) => (
              <option key={zone.zone_id} value={zone.zone_id}>
                {zone.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Operational Status:{" "}
          <select
            value={tierFilter}
            onChange={(event) => setTierFilter(event.target.value as Tier | "")}
          >
            <option value="">All statuses</option>
            {TIER_OPTIONS.map((tier) => (
              <option key={tier} value={tier}>
                {tier}
              </option>
            ))}
          </select>
        </label>
        <label>
          Search:{" "}
          <input
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="zone name or rule identifier"
          />
        </label>
      </div>

      <QueryResult
        isLoading={zonesLoading || isLoadingHistories}
        error={zonesError || historiesError}
        isEmpty={filtered.length === 0}
        emptyLabel={
          allEntries.length === 0
            ? "No assessments have been recorded yet."
            : "No assessments match these filters."
        }
        emptyHint={
          allEntries.length === 0
            ? "Run a scenario to populate the journal."
            : "Try clearing the zone, status, or search filters above."
        }
        emptyAction={
          allEntries.length === 0 && !isReplayMode ? { label: "Go to Scenario Library", to: "/scenarios" } : undefined
        }
        onRetry={isReplayMode ? undefined : () => histories.forEach((query) => query.refetch())}
      >
        <p className="kpi-sub">{filtered.length} entries</p>
        <div className="journal-list">
          {filtered.map((entry) => (
            <JournalEntryRow
              key={entry.assessment.assessment_id}
              entry={entry}
              zones={zones}
              expanded={expandedId === entry.assessment.assessment_id}
              onToggle={() =>
                setExpandedId((id) =>
                  id === entry.assessment.assessment_id ? null : entry.assessment.assessment_id,
                )
              }
            />
          ))}
        </div>
      </QueryResult>
    </section>
  );
}
