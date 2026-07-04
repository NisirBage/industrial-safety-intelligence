# Time Machine

Replays any executed scenario tick-by-tick using only persisted data
- no recomputation, no new mathematical model, no change to the
frozen deterministic engine.

## Frozen engine compliance

**Zero changes to any file under `src/domain/`.** Every value the
Time Machine displays is a `RiskAssessment`/`Permit` row this platform
already wrote, or a pure derivation over fields those rows already
carry (a bookmark is a flag, never a recomputed risk/tier/score).
Confirmed via `git status --short -- src/domain/` before, during, and
after this milestone.

## Architecture

```
Browser                                    Backend
┌──────────────────────────┐               ┌──────────────────────────┐
│ ReplayProvider (context)  │──GET /replay─▶│ replay router             │
│  └─ React Query cache      │◀──ReplayData──│  └─ src/services/replay.py│
│      (staleTime: Infinity) │               │      (reads only)         │
│                            │               │                            │
│ TimeMachinePage            │               │ RiskAssessmentRepository   │
│  ├─ ReplayController        │               │ PermitRepository           │
│  ├─ PlantMap (existing)     │               │  (both pre-existing,       │
│  ├─ PipelineDiagram         │               │   unmodified)              │
│  ├─ AgentContributionChart  │               │                            │
│  ├─ RecommendationList      │               └──────────────────────────┘
│  ├─ Counterfactual section  │
│  ├─ DecisionEvolution       │
│  └─ BookmarksPanel          │
└──────────────────────────┘
```

`GET /replay` is the platform's one new (read-only) endpoint for this
milestone. Every other view the Time Machine shows reuses an
already-existing component (`PlantMap`, `PipelineDiagram`,
`AgentContributionChart`, `RulesFiredList`, `RecommendationList`,
`TierBadge`) and an already-existing hook (`useZoneCounterfactuals`,
`useZoneWorkerCounts`, `usePermits`) - nothing was rebuilt.

### Scope decision: one consolidated page, not seven retrofitted routes

TM.3 asks that "every existing page" (Executive, Overview, Zone,
Research Mode, Decision Journal, Counterfactual, Recommendations,
Charts) stay synchronized during replay. Retrofitting all seven
standalone routes to branch on "is a replay active" would duplicate
`ScenarioReplayPage.tsx`'s own already-working synchronization pattern
across seven places. Instead, `/time-machine` is one page that shows
all of those views at once, composed from the exact same display
components each standalone route already uses, all driven by the one
shared `ReplayContext` cursor - the same relationship
`ScenarioReplayPage` already has with the plant map/pipeline/
recommendations, generalized to more views and backed by the new
consolidated endpoint instead of per-zone client-side stitching.

## State model (`ReplayContext`)

Single source of truth - `frontend/src/context/ReplayContext.tsx`:

| Field | Meaning |
|---|---|
| `target` | `{ scenarioKey }` or `{ zoneIds, start, end }`, or `null` (no replay active) |
| `allTimestamps` | Merged, deduplicated, sorted union of every zone's assessment timestamps (`lib/replayTimeline.ts::mergeTimestamps`) |
| `currentIndex` | Position in `allTimestamps` - the only piece of "where are we" state |
| `playing`, `speed` | Playback controls |
| `bookmarks` | Server-computed (from `GET /replay`) |
| `customBookmarks` | Client-only, session-scoped (see Known Limitations) |

Every action (`play`, `pause`, `reset`, `next`, `previous`,
`scrubToIndex`, `jumpToTimestamp`) only ever mutates `currentIndex`/
`playing`/`speed` - no component keeps its own copy of replay
position, satisfying "no duplicated state." `assessmentAt(zoneId)`
and `zoneTimeline(zoneId)` are the only read accessors every
synchronized view uses; both are pure derivations over the one
React-Query-cached `ReplayData` payload plus `currentIndex` (reusing
`lib/timeline.ts::assessmentAtOrBefore`, the same step-function lookup
`ScenarioReplayPage` already established - never an interpolated
value).

## API

### `GET /api/v1/replay`

Query params: either `scenario_key` (a Scenario Library entry) or all
three of `zone_ids` (comma-separated), `start`, `end` (ISO 8601).

```json
{
  "zone_ids": ["52b30591-..."],
  "start_time": "2026-07-10T09:00:00Z",
  "end_time": "2026-07-10T10:00:00Z",
  "duration_minutes": 60.0,
  "tick_count": 13,
  "zone_timelines": [
    { "zone_id": "52b30591-...", "assessments": [ /* RiskAssessmentResponse[] */ ] }
  ],
  "bookmarks": [
    { "timestamp": "...", "zone_id": "...", "kind": "critical", "label": "Reached CRITICAL", "assessment_id": "..." }
  ]
}
```

`src/services/replay.py::build_replay` is the sole implementation:
reads `RiskAssessmentRepository.history_by_zone` (pre-existing) per
zone, sorts ascending, and derives bookmarks by inspecting each
assessment's own already-persisted `justification` (`tier_before`/
`tier_after`, `rules_fired`, `compound_risk_score`) and each zone's
`Permit.issued_at` within the window - never recomputing a value the
frozen engine already wrote.

## Sequence: opening a replay and scrubbing

```
User clicks a scenario in the library
        │
        ▼
ReplayContext.startReplay({ scenarioKey })
        │
        ▼
React Query: GET /replay?scenario_key=... (fetched once)
        │
        ▼
ReplayData cached (staleTime: Infinity)
        │
        ▼
allTimestamps derived, currentIndex = 0
        │
        ▼
Every synchronized view reads assessmentAt(zoneId) for currentIndex
        │
   User drags the slider ──▶ scrubToIndex(newIndex)
        │                          │
        │                          ▼
        │                   currentIndex updates
        │                   (no network request - same cached ReplayData)
        │                          │
        ▼                          ▼
   Every synchronized view re-renders from the same cache, new index
```

## Performance (TM.9)

- `GET /replay` is fetched exactly once per `target`
  (`staleTime: Infinity` - persisted history never changes once
  written, confirmed by network inspection during live verification:
  play/pause/reset/next/previous/scrub/seek/jump-to-timestamp never
  issue a second `GET /replay` request for the same target).
  Counterfactual calls remain their own already-cached per-timestamp
  React Query entries (`useZoneCounterfactuals`), so scrubbing back to
  an already-visited tick doesn't refetch those either.
- `_HISTORY_LIMIT = 5000` in `src/services/replay.py` comfortably
  covers "1000+ ticks" per zone in one query.
- Every playback/scrub/seek operation is pure index arithmetic over
  already-fetched arrays - no derived value in `ReplayContext` performs
  an O(n²) scan on every tick beyond what `assessmentAtOrBefore`'s
  existing linear scan already does per zone per render.

## Known Limitations

- **Ephemeral Scenario Builder replays are not re-discoverable.** A
  Scenario Builder execution is deliberately never saved to the
  Scenario Library catalog (approved scope decision from that
  milestone). Its `zone_ids`/`start_time`/`end_time` are only
  available in-memory immediately after execution; the Time Machine
  can replay it in the same session (pass `{ zoneIds, start, end }` as
  the target) but there is no persisted pointer to look it up again
  after a page reload. The underlying `RiskAssessment` rows remain in
  the database and are still replayable by re-supplying the same
  zone/time window manually.
- **Custom bookmarks are session-only.** They live in `ReplayContext`'s
  React state, not on the backend - reloading the page loses them.
  Persisting them would require this platform's second write resource;
  out of scope for a purely presentational annotation with no
  simulation impact.
- **No cross-scenario replay.** A single `GET /replay` call covers one
  scenario's zone/time window; comparing two different scenarios side
  by side would need two separate replay sessions (the existing
  Decision Comparison page already covers a lighter-weight version of
  this for two specific moments).
