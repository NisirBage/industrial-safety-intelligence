import type {
  CounterfactualComparison,
  CrossScenarioAnalytics,
  ForesightResult,
  GraphEntity,
  IncidentMatch,
  Permit,
  ReplayBookmark,
  RuleFrequency,
  Zone,
} from "../api/types";
import { ALL_RECOMMENDATION_TEMPLATES } from "./recommendations";
import { STANDARDS_FOR_RECOMMENDATION } from "./complianceStandards";
import { zoneLabel } from "./format";

/**
 * M27 Part 3 (Enterprise Search) / Part 10 (search deep-links), M28
 * Part 7 (Smart Search extension) - one shared result shape across
 * every searchable category, and the pure (data-in, results-out)
 * search functions for the categories that aren't already served by
 * the Knowledge Graph's own bounded search (`searchGraphEntities`,
 * reused directly - covers Zones, Sensors, Workers, Equipment, and
 * Historical Incidents).
 *
 * M27 Part 3 deliberately left Recommendation *instances*, Forecasts,
 * Counterfactuals, and Business Impacts unsearchable, since a naive
 * implementation would scan unbounded per-tick history. M28 Part 7
 * makes them searchable anyway, but only by staying bounded: each of
 * this platform's 3 real cataloged scenarios contributes exactly one
 * representative moment (its own single highest-risk tick - the same
 * "one real moment" precedent `DecisionComparisonPage` already
 * established), never a scan across every tick. Standards and
 * Lessons/Hazards are genuinely static/deck-level (no scenario scan
 * needed at all): Standards mirrors `complianceStandards.ts`
 * directly, and Lessons/Hazards read the already-bounded
 * `CrossScenarioAnalytics` aggregate (M24) the Historical Intelligence
 * panel already computes.
 */
export interface EnterpriseSearchResult {
  category:
    | "Zone"
    | "Sensor"
    | "Worker"
    | "Equipment"
    | "Historical Incident"
    | "Permit"
    | "Recommendation"
    | "Standard"
    | "Lesson"
    | "Hazard"
    | "Event"
    | "Counterfactual"
    | "Forecast"
    | "Business Impact";
  id: string;
  label: string;
  detail: string;
  deepLink: string;
}

const GRAPH_CATEGORY: Partial<Record<GraphEntity["kind"], EnterpriseSearchResult["category"]>> = {
  zone: "Zone",
  sensor: "Sensor",
  worker: "Worker",
  equipment: "Equipment",
  historical_incident: "Historical Incident",
};

/** Zones deep-link to their own dedicated page; every other graph
 * entity kind deep-links into the Operational Knowledge Graph,
 * focused on that exact node (`?focus=kind:id`, read by
 * `KnowledgeGraphPage`). */
export function graphEntityToSearchResult(entity: GraphEntity): EnterpriseSearchResult | null {
  const category = GRAPH_CATEGORY[entity.kind];
  if (!category) {
    return null;
  }
  const deepLink =
    entity.kind === "zone"
      ? `/zones/${entity.id}`
      : `/knowledge-graph?focus=${encodeURIComponent(`${entity.kind}:${entity.id}`)}`;
  return { category, id: `${entity.kind}:${entity.id}`, label: entity.label, detail: category, deepLink };
}

export function searchPermits(
  permits: Permit[],
  zones: Zone[] | undefined,
  query: string,
): EnterpriseSearchResult[] {
  const needle = query.trim().toLowerCase();
  if (!needle) {
    return [];
  }
  return permits
    .filter(
      (permit) =>
        permit.permit_type.toLowerCase().includes(needle) ||
        permit.status.toLowerCase().includes(needle) ||
        zoneLabel(permit.zone_id, zones).toLowerCase().includes(needle),
    )
    .map((permit) => ({
      category: "Permit" as const,
      id: permit.permit_id,
      label: `${permit.permit_type} - ${zoneLabel(permit.zone_id, zones)}`,
      detail: `Status: ${permit.status}`,
      deepLink: `/permits`,
    }));
}

/** Searches the static recommendation vocabulary (tier baselines +
 * rule-keyed templates) - text search, not a specific tick's
 * instance. Deep-links generically into the Knowledge Graph rather
 * than a specific Recommendation node, since no single tick is
 * implied by a vocabulary match. */
export function searchRecommendationTemplates(query: string): EnterpriseSearchResult[] {
  const needle = query.trim().toLowerCase();
  if (!needle) {
    return [];
  }
  return ALL_RECOMMENDATION_TEMPLATES.filter((template) =>
    template.text.toLowerCase().includes(needle),
  ).map((template) => ({
    category: "Recommendation" as const,
    id: template.id,
    label: template.text,
    detail: `Severity: ${template.severity} (vocabulary reference, not a specific tick)`,
    deepLink: "/knowledge-graph",
  }));
}

/** M28 Part 7 - the static compliance-standard vocabulary
 * (`complianceStandards.ts`), deduplicated by code (the same standard
 * supports multiple recommendation ids). Zero fetches - this table is
 * already loaded client-side. */
export function searchStandards(query: string): EnterpriseSearchResult[] {
  const needle = query.trim().toLowerCase();
  if (!needle) {
    return [];
  }
  const seen = new Map<string, EnterpriseSearchResult>();
  for (const standards of Object.values(STANDARDS_FOR_RECOMMENDATION)) {
    for (const standard of standards) {
      if (seen.has(standard.code + standard.title)) {
        continue;
      }
      const haystack = `${standard.code} ${standard.title} ${standard.summary}`.toLowerCase();
      if (haystack.includes(needle)) {
        seen.set(standard.code + standard.title, {
          category: "Standard",
          id: standard.code + standard.title,
          label: `${standard.code} - ${standard.title}`,
          detail: standard.summary,
          deepLink: "/knowledge-graph",
        });
      }
    }
  }
  return [...seen.values()];
}

/** M28 Part 7 - lessons/hazards from the already-bounded, deck-level
 * `CrossScenarioAnalytics` aggregate (M24) - never a per-tick scan.
 * Root-cause/equipment/permit rule frequencies become "Lesson"
 * results; worker-hazard rule frequencies become "Hazard" results
 * (the analytics endpoint's own field is literally named
 * `most_common_worker_hazards`). */
export function searchAnalyticsLessonsAndHazards(
  analytics: CrossScenarioAnalytics | undefined,
  query: string,
): EnterpriseSearchResult[] {
  const needle = query.trim().toLowerCase();
  if (!needle || !analytics) {
    return [];
  }
  function toResults(entries: RuleFrequency[], category: "Lesson" | "Hazard"): EnterpriseSearchResult[] {
    return entries
      .filter((entry) => entry.lesson.toLowerCase().includes(needle) || entry.rule.toLowerCase().includes(needle))
      .map((entry) => ({
        category,
        id: `${category}:${entry.rule}`,
        label: entry.lesson,
        detail: `Rule: ${entry.rule} (${entry.incident_count} incident(s), cross-scenario)`,
        deepLink: "/knowledge-graph",
      }));
  }
  return [
    ...toResults(analytics.most_common_causes, "Lesson"),
    ...toResults(analytics.most_common_equipment_issues, "Lesson"),
    ...toResults(analytics.most_common_permit_conflicts, "Lesson"),
    ...toResults(analytics.most_common_worker_hazards, "Hazard"),
  ];
}

/** M28 Part 7 - one representative real moment per cataloged scenario:
 * that scenario's own single highest-compound-risk-score tick, never
 * a scan across every tick. Assembled once per scenario by the
 * caller (`useSmartSearchExtensions`), from data every other page in
 * this app already fetches (`GET /replay`, `GET /counterfactual`,
 * `GET /historical/matches`, `GET /foresight/forecast`). */
export interface ScenarioMoment {
  scenarioKey: string;
  scenarioTitle: string;
  zoneId: string;
  timestamp: string;
  assessmentId: string;
  events: ReplayBookmark[];
  counterfactual?: CounterfactualComparison;
  foresight?: ForesightResult;
  bestMatch?: IncidentMatch;
}

export function searchEvents(
  moments: ScenarioMoment[],
  zones: Zone[] | undefined,
  query: string,
): EnterpriseSearchResult[] {
  const needle = query.trim().toLowerCase();
  if (!needle) {
    return [];
  }
  return moments.flatMap((moment) =>
    moment.events
      .filter((event) => event.label.toLowerCase().includes(needle) || event.kind.toLowerCase().includes(needle))
      .map((event) => ({
        category: "Event" as const,
        id: `${moment.scenarioKey}:${event.zone_id}:${event.timestamp}`,
        label: event.label,
        detail: `${zoneLabel(event.zone_id, zones)} - ${moment.scenarioTitle}`,
        deepLink: `/scenarios/${moment.scenarioKey}`,
      })),
  );
}

export function searchCounterfactuals(
  moments: ScenarioMoment[],
  zones: Zone[] | undefined,
  query: string,
): EnterpriseSearchResult[] {
  const needle = query.trim().toLowerCase();
  if (!needle) {
    return [];
  }
  return moments
    .filter((moment) => moment.counterfactual)
    .map((moment) => {
      const cf = moment.counterfactual!;
      const label = cf.counterfactual.alert
        ? "Traditional threshold system would have alerted"
        : "Traditional threshold system stayed silent";
      const haystack = `${label} ${moment.scenarioTitle} counterfactual`.toLowerCase();
      return haystack.includes(needle)
        ? {
            category: "Counterfactual" as const,
            id: `${moment.scenarioKey}:${moment.zoneId}:${moment.timestamp}`,
            label,
            detail: `${zoneLabel(moment.zoneId, zones)} - ${moment.scenarioTitle} (most notable divergence)`,
            deepLink: `/counterfactual/${moment.zoneId}?timestamp=${encodeURIComponent(moment.timestamp)}`,
          }
        : null;
    })
    .filter((result): result is NonNullable<typeof result> => result !== null);
}

export function searchForecasts(
  moments: ScenarioMoment[],
  zones: Zone[] | undefined,
  query: string,
): EnterpriseSearchResult[] {
  const needle = query.trim().toLowerCase();
  if (!needle) {
    return [];
  }
  return moments
    .filter((moment) => moment.foresight)
    .filter((moment) => {
      const f = moment.foresight!;
      const haystack = `${f.early_warning.category} ${f.early_warning.why} ${moment.scenarioTitle} forecast`.toLowerCase();
      return haystack.includes(needle);
    })
    .map((moment) => ({
      category: "Forecast" as const,
      id: `${moment.scenarioKey}:${moment.zoneId}:${moment.timestamp}`,
      label: `${moment.foresight!.early_warning.category} - ${zoneLabel(moment.zoneId, zones)}`,
      detail: `${moment.foresight!.early_warning.why} (${moment.scenarioTitle}, highest-risk tick)`,
      deepLink: `/decision-workspace/${moment.assessmentId}?stage=forecast`,
    }));
}

export function searchBusinessImpacts(
  moments: ScenarioMoment[],
  zones: Zone[] | undefined,
  query: string,
): EnterpriseSearchResult[] {
  const needle = query.trim().toLowerCase();
  if (!needle) {
    return [];
  }
  return moments
    .filter((moment) => moment.bestMatch)
    .filter((moment) => moment.bestMatch!.business_impact.toLowerCase().includes(needle))
    .map((moment) => ({
      category: "Business Impact" as const,
      id: `${moment.scenarioKey}:${moment.zoneId}:${moment.timestamp}`,
      label: moment.bestMatch!.business_impact,
      detail: `${zoneLabel(moment.zoneId, zones)} - ${moment.scenarioTitle} (highest-risk tick)`,
      deepLink: `/decision-workspace/${moment.assessmentId}?stage=business_impact`,
    }));
}
