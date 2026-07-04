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
              <h4>Agent Contributions</h4>
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
 */
export function DecisionJournalPage() {
  const { data: zones, isLoading: zonesLoading, error: zonesError } = useZones();
  const zoneIds = useMemo(() => (zones ?? []).map((zone) => zone.zone_id), [zones]);
  const histories = useAllZoneHistories(zoneIds);

  const [tierFilter, setTierFilter] = useState<Tier | "">("");
  const [zoneFilter, setZoneFilter] = useState("");
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const isLoadingHistories = histories.some((query) => query.isLoading);
  const historiesError = histories.find((query) => query.error)?.error;

  const allEntries: JournalEntry[] = useMemo(
    () =>
      zoneIds.flatMap((zoneId, index) => {
        const items = histories[index]?.data?.items ?? [];
        return items.map((assessment) => ({ zoneId, assessment }));
      }),
    [zoneIds, histories],
  );

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
          Tier:{" "}
          <select
            value={tierFilter}
            onChange={(event) => setTierFilter(event.target.value as Tier | "")}
          >
            <option value="">All tiers</option>
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
        emptyLabel="No assessments match these filters."
      >
        <p>{filtered.length} entries</p>
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
