# Operational Knowledge Graph

A single navigable, read-only evidence graph connecting every entity
behind a decision - sensors, workers, permits, risk assessments,
recommendations, historical incidents, forecasts, counterfactuals,
business impact - so a judge (or an operator) can click any entity and
immediately see what it is, what influenced it, and what evidence
backs it. Built for exactly one purpose: unify everything the platform
already computes into one map, without computing anything new.

## Frozen engine compliance

**Zero changes to any file under `src/domain/`.** The graph is a
read-only visualization/navigation layer over data every other
milestone already produces. It never modifies a recommendation, risk
score, fusion result, tier, simulation, forecast, historical
similarity, or counterfactual - it only draws edges between entities
that already exist. Confirmed via `git status --short -- src/domain/`
before, during, and after this milestone; every backend endpoint added
is additive (`GET /graph/*`, nothing under `PUT`/`POST`/`DELETE`).

## Architecture

`src/knowledge_graph/` is a new sibling package, structurally identical
in intent to `src/historical/` and `src/foresight/` - it reads existing
repositories and services and assembles the results into graph
entities/edges, never computing new business logic.

```
entities.py          - 15 EntityKind constants, GraphEntity dataclass,
                        composite id encode/decode (Plant, Zone,
                        Sensor, SensorReading, Worker, Equipment,
                        Permit, RiskAssessment, TriggeredAgent,
                        Recommendation, HistoricalIncident, Forecast,
                        LessonLearned, Counterfactual, BusinessImpact)
relationships.py      - RelationKind constants + RELATIONSHIP_CATALOG,
                        each entry naming the exact repository method
                        or function that grounds it
recommendation_text.py - a vocabulary mirror of
                        frontend/src/lib/recommendations.ts's two
                        frozen lookup tables (TIER_BASELINE,
                        RULE_RECOMMENDATIONS), not a re-derivation of
                        which recommendation applies
builders.py           - 15 build_*_entity() pure functions, one per
                        entity kind, each copying only already-computed
                        fields
service.py            - GraphService: get_entity, get_neighbors (one
                        hop), get_subgraph (bounded BFS), search
                        (substring, queryable kinds only), get_path
                        (deterministic BFS shortest path)
```

REST surface (`src/api/routers/graph.py`, additive-only, all `GET`):

```
GET /api/v1/graph/entity/{kind}/{id}
GET /api/v1/graph/neighbors/{kind}/{id}
GET /api/v1/graph/subgraph/{kind}/{id}?depth=&max_nodes=
GET /api/v1/graph/search?q=&limit=
GET /api/v1/graph/path?source_kind=&source_id=&target_kind=&target_id=&max_depth=
```

The milestone's own example URL was `/graph/entity/{id}` (no kind
segment); this was deliberately changed to `/graph/entity/{kind}/{id}`
since a bare id is ambiguous/collision-prone across 15 entity kinds
with very different id shapes (a UUID, a scenario_key string, or a
composite `|`-joined string) - a correctness fix over literal
instruction-following, consistent with this project's established
precedent for this category of deviation.

## Entity model

Every node references a real, existing id - nothing is invented:

| Kind | Backing data |
|---|---|
| Plant | Synthetic root node; label is the real `Settings.app_name` (no dedicated Plant table exists) |
| Zone | `Zone` ORM row |
| Sensor | `Sensor` ORM row |
| SensorReading | `SensorReading` ORM row (latest per sensor/gas) |
| Worker | `Worker` ORM row |
| Equipment | `Equipment` ORM row |
| Permit | `Permit` ORM row |
| RiskAssessment | `RiskAssessment` ORM row |
| TriggeredAgent | One agent's contribution within a `RiskAssessment.justification`, risk > 0 only |
| Recommendation | One entry from `recommendation_templates_for(tier, rules_fired)` |
| HistoricalIncident | `HistoricalIncident` (M24 decks) |
| Forecast | A zone/timestamp's real `generate_operational_foresight()` result (M25) |
| LessonLearned | `lessons_for_rules()` template (M24) |
| Counterfactual | Real `evaluate_counterfactual()` result for a zone/timestamp |
| BusinessImpact | 4 real sub-kinds (business_impact/workers_affected/permit_impact - plus operational_stability computed lazily via Forecast); 3 more (downtime, financial_exposure, environmental_exposure) are honestly marked `Status: Unavailable` since no such mechanic exists anywhere in this platform's real data model |

Composite ids use `|` as a separator (not `:`), because ISO-8601
timestamps already contain `:` - a `_ID_SEPARATOR = "|"` choice caught
and fixed before any test was run, verified by a dedicated round-trip
unit test.

## Relationship model

23 cataloged relationships (`RELATIONSHIP_CATALOG` in
`relationships.py`), each naming its real evidence source: Plant
contains Zone, Zone contains Sensor/Worker/Equipment/Permit, Sensor
produced SensorReading, RiskAssessment triggered TriggeredAgent,
RiskAssessment generated Recommendation, RiskAssessment matched
HistoricalIncident, RiskAssessment projects_for Forecast, and so on.

Two relationship families the milestone asked for were deliberately
**not** fabricated:

- **"Same industry / same equipment / same hazard" between historical
  incidents.** This platform has exactly one plant/deck - those would
  be trivially-always-true constants, not real discriminators.
  Substituted two genuinely groundable relationships computed from
  real data instead: `SAME_OUTCOME` (both incidents' real worst-tier
  reached matches) and `SAME_TRIGGERED_RULE` (both incidents share an
  identical real `rules_fired` id).
- **Forecast → Recommendation causality.** Labeled `CO_OCCURS_WITH`,
  never `GENERATED`/`INFORMED` - this is a hard, tested invariant
  (`test_forecast_to_recommendation_edge_is_labeled_co_occurs_with_not_generated`)
  preserving M25's rule that Operational Foresight never appears to
  influence a recommendation, even at the presentation layer.

## Frontend

`@xyflow/react` (v12) renders the canvas - the standard tool for
zoom/pan/drag/minimap node-link diagrams, a genuinely new capability
this frontend didn't have (Recharts is chart-only). Layout is
`layoutRadial()` (`lib/graphLayout.ts`): deterministic concentric
rings by BFS distance from the root, angularly spaced within each ring
- never force-directed, so the same input always produces the exact
same layout (no physics, no randomness, no settling).

- `KnowledgeGraphPage.tsx` - starts from a one-hop neighborhood of the
  Plant root (lazy, bounded initial view), merges in further neighbors
  only when a node is explicitly expanded.
- `GraphCanvas.tsx` / `EntityNode.tsx` - the React Flow canvas and its
  one shared node renderer, styled per-kind via CSS.
- `NodeInspector.tsx` - Part 6: selected entity's attributes plus every
  real neighbor, each clickable.
- `GraphSearchBar.tsx` / `GraphBreadcrumbs.tsx` - substring search and
  a recenter trail.
- `PathExplorer.tsx` - Part 7: pick any two entities, see
  `GraphService.get_path`'s real BFS shortest chain between them.
- `RootCauseNavigator.tsx` - Part 8: a guided, clickable drill-down
  through any entity's real neighbors, grouped by relation - generic
  over all 15 kinds, so it doubles as the Historical/Forecast/
  Counterfactual navigation Parts 9-11 ask for (a Forecast's neighbors
  include its historical evidence; a Counterfactual's neighbors
  include the RiskAssessment it references).
- `JudgeModePlayer.tsx` - Part 13 ("Explain This Decision"): steps
  through the real Sensor → Agent → Risk → Historical Match → Forecast
  → Recommendation chain for one Risk Assessment, highlighting one
  real edge at a time on the canvas. Built from exactly two one-hop
  neighbor calls (`lib/judgeModePath.ts::buildJudgeModeSteps`); steps
  whose evidence doesn't exist for a given tick (no historical match,
  no forecast) are omitted, never fabricated.

## Performance (Part 14)

- **Never renders the whole graph.** `KnowledgeGraphPage` seeds the
  canvas via `GET /graph/subgraph/{kind}/{id}?depth=1` from the Plant
  root; further neighbors are fetched only when a node is explicitly
  clicked/expanded, merged into the displayed subgraph in memory.
- **`GraphService.get_subgraph`** is a bounded BFS: it stops at either
  `depth` hops or `max_nodes` (default 60, ceiling 150 at the API
  layer) distinct nodes, whichever comes first - traversal cost never
  scales with the underlying graph's true size once the ceiling is
  hit. Measured via `scripts/benchmark_knowledge_graph.py` (compute-only,
  fixture-based, since this sandbox has no live database): traversal
  time stayed under 0.1 ms across fixtures from 13 to 585 reachable
  nodes, because the BFS always stops at the node ceiling regardless
  of how much larger the underlying graph is.
- **`GraphService.get_path`** is deterministic BFS with a `max_depth`
  ceiling (default 6, API ceiling 8); an unreachable target within
  budget returns `found: false` cheaply rather than exhausting a full
  graph scan - measured at 0.066 ms against an 8-level fixture.
- **The two genuinely expensive traversals** - a RiskAssessment's
  matched historical incidents, and a Forecast's own trajectory match
  - reuse the existing, already-cached `find_similar_incidents`/
  `generate_operational_foresight` functions and are paid only when a
  caller expands that specific node, never eagerly during a
  neighborhood fetch.
- **React Query caching**: `useGraphNeighbors`/`useGraphSubgraph` use
  `staleTime: 5 minutes`, so re-expanding an already-expanded node
  within a session never re-fetches.
- **Layout is O(n) per render**: `layoutRadial` is one BFS pass plus a
  single sort per ring - no iterative physics simulation to converge.

## Known limitation

This sandbox has no live PostgreSQL (confirmed unchanged since M9) -
every `GET /graph/*` endpoint that reads real data returns the same
pre-existing `psycopg.OperationalError` every other DB-backed endpoint
in this app does in this environment. This is not a defect introduced
by this milestone; it is the same disclosed, unchanged environment
constraint carried since M9, verified by direct comparison against
`/risk/current` and `/replay`'s identical failure mode.
