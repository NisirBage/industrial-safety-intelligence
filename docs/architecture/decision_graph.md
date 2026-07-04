# Decision Intelligence Graph & Root Cause Explorer

Exposes the reasoning the frozen deterministic engine already
produced - a clickable DAG, a per-node inspector, a "why did this
happen?" synthesis, a naive-threshold overlay, animated influence-path
tracing, a deterministic executive summary, and a technical view for
judges who want raw numbers. Nothing here is a new computation.

## Frozen engine compliance

**Zero changes to any file under `src/domain/`.** Every value
displayed - agent contributions, rules fired, interaction bonus, tier
transitions, the counterfactual verdict - is copied from an
already-persisted `RiskAssessment.justification`/`CounterfactualComparison`,
or is a pure sort/filter/template over those same fields. Confirmed
via `git status --short -- src/domain/` before, during, and after this
milestone. **No new backend API was needed at all** - every piece of
data this milestone displays was already exposed by `GET /replay`,
`GET /counterfactual/{zone_id}`, `GET /zones/{id}/workers/count`, and
`GET /permits`.

## Architecture

The Decision Graph is `PipelineDiagram.tsx` (built in M11.4, confirmed
in M12.3 as already satisfying "interactive DAG, click every node") -
extended, not replaced, in this milestone:

```
Sensors → Context Builders → { Gas Risk, Worker Exposure,
Equipment Status, Permit Intelligence } → Fusion → Tiering →
Explainability → Recommendations
```

Every node is a `<button>` that toggles an inspector panel below the
graph. New this milestone:

- **Node Inspector additions** (Evidence, Source timestamp) - Evidence
  is which of this tick's own `rules_fired` entries originated at that
  stage (`lib/pipelineStages.ts::groupRulesByStage`/`agentStage`,
  already existed and already tested - reused, not duplicated). Source
  timestamp is the shared `assessment.timestamp` every stage's numbers
  came from.
- **Counterfactual Overlay** (`showCounterfactualOverlay`, a
  self-contained toggle inside `PipelineDiagram`) - highlights, purely
  via CSS classes: which agent nodes the naive Counterfactual
  Comparator structurally never reads (`lib/rootCause.ts::
  isIgnoredByThresholdEngine` - a fixed architectural fact from
  `docs/algorithms/counterfactual.md`, not tick-dependent), this tick's
  top-ranked contributing agent (`rankContributingFactors`), and Fusion
  when an interaction bonus was actually applied
  (`hasInteractionBonus`).
- **Influence Path tracing** (`showCounterfactualOverlay`'s sibling
  "Trace influence path" button) - a one-shot, staggered CSS animation
  through Sensors → Context Builders → the top contributing agent →
  Fusion → Tiering → Recommendations, using the same
  `topFactorAgentName` the overlay already computed.

## Data flow

```
GET /replay (already exists, Time Machine milestone)
        │
        ▼
ReplayContext.assessmentAt(zoneId) → RiskAssessment
        │
        ▼
parseJustification(assessment.justification) → RiskJustification
        │
        ├──▶ PipelineDiagram (Decision Graph + Node Inspector + Overlay + Path tracing)
        ├──▶ RootCauseExplorer ("Why did this happen?")
        ├──▶ generateExecutiveExplanation() → one-paragraph summary
        └──▶ TechnicalView (raw numbers, for judges)
```

Nothing in this chain re-fetches or recomputes; every consumer reads
the one `RiskAssessment` the Time Machine's cursor already resolved.

## Graph model

`PipelineDiagram`'s internal `StageId` union is the node set:
`sensors | context_builders | agent_${string} | fusion | tiering |
explainability | recommendations`. Edges are implicit (rendered as
fixed arrows in source order) since the pipeline is a strict linear
DAG with one fan-out (the four agents) and one fan-in (back to
Fusion) - there is no dynamic graph layout, matching the frozen
`EXECUTION_PLAN`'s own fixed shape (`src/domain/orchestrator/
scheduler.py`).

## Root Cause Explorer

`RootCauseExplorer.tsx` - "Why did this happen?" - assembles, in
order:

1. **Top contributing factors**, ordered by contribution
   (`rankContributingFactors`, a pure sort over `agent_contributions`).
2. **Interaction bonus**, only when the backend's own `rules_fired`
   contains `"interaction_bonus_applied"` (`hasInteractionBonus` -
   matches the exact condition `risk_formula.py`'s `fuse()` uses;
   `interactionBonusApplied` is a multiplier where `1.0` is the neutral
   "no bonus" value, not `0`, a distinction this codebase got wrong
   once already this session and now checks the rule name instead).
3. **Rules fired** (`RulesFiredList`, reused unchanged).
4. **Counterfactual comparison** (`explainComparison`, reused
   unchanged from the Decision Comparison milestone - same divergence
   logic, same wording).
5. **Affected workers/permits/equipment**, from the same
   `useZoneWorkerCounts`/`usePermits`/`agent_contributions.
   equipment_status` data the Plant Map and Executive dashboard already
   read.

## Executive Explanation (deterministic)

`lib/executiveExplanation.ts::generateExecutiveExplanation` is a
template, not a model: given the same `(assessment, justification,
recommendations)` triple, it always returns the exact same string.
Every clause names a value the frozen engine already computed - the
dominant agent by raw risk, the interaction bonus multiplier (only
when the rule fired), the tier transition, and the top recommendation
text (itself a lookup table, `lib/recommendations.ts`, not a model).
No LLM, no randomness, no network call.

## Technical View

`TechnicalView.tsx` - a dense grid of raw `RiskAssessment`/
`justification` fields (unformatted numbers, not narrative) plus the
bookmarks in the current zone's replay window, for a judge who wants
to check the numbers directly rather than read a sentence about them.

## Interaction model

- Click any Decision Graph node → inspector panel updates below.
- Toggle "Show counterfactual overlay" → CSS classes appear/disappear
  on the relevant nodes; toggling again removes them. Self-contained
  per `PipelineDiagram` instance - no prop plumbing needed by callers.
- Click "Trace influence path" → a ~2.5s staggered highlight runs once
  through the causal chain, then automatically resets (button
  re-enables) so it can be re-triggered.
- Toggle "Show technical view" (Time Machine page) → the dense raw-data
  grid appears/disappears.
- Everything above re-renders instantly as the Time Machine's replay
  cursor moves (scrub, play, jump, bookmark-click) - no page refresh,
  since every consumer reads from the same `ReplayContext`-cached
  `GET /replay` payload.

## Known limitations

- The Decision Graph's layout is fixed/linear, not a general
  force-directed graph - this matches the frozen pipeline's own fixed
  shape (one execution plan, no branching), so a more general graph
  layout would visualize a flexibility the engine doesn't actually
  have.
- "Evidence" per node is a keyword/stage match against `rules_fired`,
  not a full audit trail of every intermediate value an agent computed
  internally (those aren't persisted individually, only the final
  `risk`/`confidence` pair is).
- The Counterfactual Overlay's "ignored by threshold engine" highlight
  is a fixed architectural fact (which agents the naive comparator
  reads), not derived per-tick - it never changes regardless of which
  assessment is displayed, which is the correct, honest representation
  of a structural property, not a discovered one.
