# Intelligent Incident Response & Operations Center

"What should the operator do right now?" - one page composing every
other decision-intelligence surface this platform already built
(Recommendations, Root Cause, the Decision Graph, the Counterfactual
Comparison, the Digital Twin, Time Machine replay) into an ordered,
actionable queue, with a fixed procedural dependency chain, plant SOP
references, a chronological incident timeline, and a qualitative
"what does this action actually target" explorer. Nothing here is a
new reasoning engine - it is a visualization and planning layer over
outputs the frozen deterministic engine already produced.

## Frozen engine compliance

**Zero changes to any file under `src/domain/`.** Zero new backend
endpoints. Confirmed via `git status --short -- src/domain/` before,
during, and after this milestone. Every value this page shows - tier,
compound score, confidence, interaction bonus, agent contributions,
rules fired, worker/permit/equipment records, the counterfactual
verdict - was already exposed by `GET /risk/current`, `GET /replay`,
`GET /zones`, `GET /workers`, `GET /zones/{id}/sensors`,
`GET /zones/{id}/equipment`, `GET /permits`, and
`GET /counterfactual/{zone_id}`.

## A genuine architectural tension, resolved before writing code

The milestone's own example ("Expected Risk: 94 → 37") asks for a
projected compound-risk value if a specific recommendation were
followed. That value does not exist anywhere:

- The persisted Counterfactual output never produces a continuous
  score for any hypothetical - by design (`docs/algorithms/
  counterfactual.md`) it is a single naive alert/no-alert trip point.
- The Fusion formula's inputs that would let anyone compute "risk with
  one agent's contribution removed" - the per-agent weights and the
  interaction-bonus constant `κ` - are not exposed by any endpoint,
  only the final `compound_risk_score` and the resulting
  `interaction_bonus_applied` multiplier are.
- Re-implementing Fusion's math in the frontend to produce that number
  (even from the published formula) would duplicate frozen logic
  outside its module - the exact isolation `CounterfactualComparator`
  is structurally forbidden from breaching toward the compound engine
  (`CORE_FREEZE.md` §11), and would directly violate this milestone's
  own explicit "never recompute" instruction.

Resolution (confirmed with the project owner before implementation):
**qualitative impact levels only.** `lib/actionPlaybook.ts` assigns
each recommendation a baseline `ImpactLevel` (`CRITICAL` / `VERY HIGH`
/ `HIGH` / `MODERATE` / `LOW` / `INFORMATIONAL`), escalated by exactly
one rung when this tick's own persisted `rules_fired`/
`agent_contributions` show the action's targeted factor is genuinely
part of the current interaction bonus (`computeImpactLevel`) - a
disclosed categorical rule over real fields, never a numeric
projection. The Operational Impact Explorer (renamed from "Risk
Reduction Simulator") shows *which* real, already-persisted number
(an agent's current risk/confidence, the actual interaction bonus
multiplier) each action targets, never a "before/after" pair.

## Architecture

```
GET /risk/current  ─┐
GET /replay        ─┼─▶ OperationsCenterPage ─┬─▶ ActionQueue (Action Cards)
GET /workers        │         │               ├─▶ OperationalDependencyGraph
GET /zones/*/sensors│         │               ├─▶ OperationalImpactExplorer
GET /zones/*/equipment       │               ├─▶ SopPanel
GET /permits         │         │               ├─▶ OperatorTimeline
GET /counterfactual  │         │               ├─▶ PlantMap (Digital Twin snapshot)
                     │         │               └─▶ PipelineDiagram (Decision Graph snapshot)
                     │         └─ ReplayContext (shared with Time Machine/Digital Twin)
```

### Component hierarchy

```
OperationsCenterPage
├─ ActionQueue
│  └─ ActionCard (one per recommendation, expandable)
├─ OperationalDependencyGraph (buildDependencyLevels)
├─ OperationalImpactExplorer
├─ SopPanel
├─ OperatorTimeline
├─ PlantMap (reused from Digital Twin, showLegend)
├─ ZoneInspectorDrawer (reused from Digital Twin, close button hidden)
└─ PipelineDiagram (reused from Decision Graph) + a static node/action
   cross-reference list
```

Every sub-component is presentational; `OperationsCenterPage` fetches
once and passes data down, mirroring the pattern established by
`TimeMachinePage`/`DigitalTwinPage`.

## State flow / synchronization (IOC.11)

Dual-mode, identical to `TimeMachinePage`/`DigitalTwinPage`: reads
`useReplay()` - live `/risk/current` data when `replay.target === null`,
the replay cursor's data (`replay.assessmentAt(zoneId)`) otherwise.
**No new replay state was introduced** - the same global
`ReplayProvider` (mounted once at the app root) is the single source
of truth every page reads, so scrubbing/playing/jumping the Time
Machine updates the Operations Center, the Digital Twin, and the
Decision Graph simultaneously with zero duplicated cursors.

### Bidirectional navigation (IOC.8/IOC.9)

- **Digital Twin → Operations Center**: `ZoneInspectorDrawer` (used by
  both `/digital-twin` and embedded in this page) links to
  `/operations?zone={zoneId}`.
- **Operations Center → Digital Twin**: an "Open full Digital Twin →"
  link carries `?zone=` the other direction; clicking a zone inside the
  embedded `PlantMap` updates `focusedZoneId` in place (no navigation
  needed for same-page selection).
- **Time Machine → Operations Center**: `TimeMachinePage`'s zone-detail
  card gained an "Operations Center →" link.
- **Decision Graph → Operations Center**: the embedded `PipelineDiagram`
  is reused unmodified (its own click/inspector/overlay/trace behavior
  is untouched); a read-only "Actions by pipeline stage" list below it
  cross-references each active action's `targetedFactor` to the stage
  name it corresponds to, without reaching into `PipelineDiagram`'s
  internal state.

The `?zone=` query parameter is read once via `useSearchParams` to seed
the initial `focusedZoneId`, then kept in sync on every zone selection
- a plain URL param, not a new global store.

## Operational Dependency Graph (IOC.3)

`lib/dependencyGraph.ts::buildDependencyLevels` topologically layers
the *current tick's own active actions* by `PrioritizedAction.
dependencyLabels` - itself computed once by `buildActionQueue` from
the same `dependsOn` config the Action Queue's "Dependencies" field
reads, so the graph and the queue can never disagree. A dependency
pointing at a recommendation not active this tick is treated as no
dependency at all (not as a phantom level), and a configuration cycle
(an authoring error, not a runtime condition) resolves to level 0
rather than hanging the UI.

## Operator Timeline (IOC.6)

Replay mode reuses the Time Machine's own persisted bookmarks
(`replay.bookmarks`, filtered to the focused zone) directly - no
duplicated detection logic. Live mode has no `/replay`-style window
for "right now", so `lib/operatorTimeline.ts::deriveTimelineEvents`
provides a lighter, client-side equivalent (tier changes, entering
CRITICAL, interaction-bonus onset, the single highest-risk tick) over
`GET /risk/history/{zoneId}` - intentionally a subset of the backend's
fuller bookmark detector, not a reimplementation of it, since the two
only need to agree in spirit, never bit-for-bit.

## Known limitations

- **No numeric risk-reduction projection anywhere on this page, by
  design** - see "A genuine architectural tension" above. This is the
  single most consequential decision in this milestone and is called
  out here so it is never mistaken for an oversight.
- The "required personnel"/"required equipment" fields in
  `lib/actionPlaybook.ts` are authored operational metadata (a
  refinery's real staffing/equipment procedures), not derived from any
  persisted record of who is actually qualified or which equipment is
  actually available - a real deployment would source these from a
  staffing/CMMS system this platform doesn't have.
- SOP references (`lib/sopReferences.ts`) are illustrative document
  numbers for demo purposes; `externalUrl` is `null` everywhere on
  purpose (a real deployment would point it at the plant's own
  document management system, which this platform cannot know).
- `OperatorTimeline`'s live-mode detector only looks at the focused
  zone's own history window (`LIVE_HISTORY_LIMIT = 50` most recent
  assessments) - a genuinely long-running incident beyond that window
  would need a larger limit or a dedicated backend aggregation
  (the same trade-off Time Machine's own bookmark detector already
  documents for its `_HISTORY_LIMIT`).
