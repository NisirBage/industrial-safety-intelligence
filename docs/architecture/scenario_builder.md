# Scenario Builder

Lets a user compose a deterministic incident through forms and a
draggable timeline instead of hand-editing a `scenarios/*.yaml` file,
then executes it through the same, unmodified pipeline every
pre-authored scenario already runs through.

## Frozen engine compliance

**Zero changes to any file under `src/domain/`.** This feature is
entirely new orchestration in `src/services/scenario_builder.py` and a
new API surface in `src/api/routers/scenario_builder.py` (plus small,
additive read endpoints for workers/sensors/equipment). Confirmed via
`git status --short -- src/domain/` before and after this milestone.

## Scope decision: pick from existing, don't author new plant entities

The product ask included "Add Zones / Add Workers / Add Equipment."
The frozen `Scenario` dataclass (`src/domain/simulation/scenario.py`,
frozen per `CORE_FREEZE.md` §3) has exactly four fields: `seed`,
`start_time`, `sensor_events`, `permit_events`. There is no
zone/worker/equipment-authoring concept in it at all - sensor events
reference an *existing* zone + gas type, permit events reference an
*existing* zone and worker. Equipment isn't referenced by a scenario
at all; its state is static plant data the Equipment Status agent
reads directly.

Extending that frozen dataclass to support inline entity authoring
would be a change to a frozen interface, requiring ADR approval per
§10. This was flagged to the project owner before any code was
written; the approved scope (documented in the session's own
Architecture Impact Assessment exchange) is: the builder lets a user
**pick from** already-existing, pre-seeded zones/workers/sensors, and
**browse** (read-only) existing equipment - it never creates a new
zone, worker, or equipment record, and it never touches the frozen
`Scenario` schema's shape.

## The zone_key adaptation

`SensorEvent.zone_key` / `PermitEvent.authorizing_officer_key` are
plain `str` fields in the frozen dataclasses, populated in a
hand-authored YAML file with a semantic slug (e.g.
`"zone-tank-farm"`) that `src/services/simulation_runner.py`'s
`validate_references`/`run_scenario` resolve to a real id via the
frozen, deterministic `resolve_id()` (UUIDv5).

The Scenario Builder has no semantic slug to put there - a user picks
an existing zone from `GET /zones`, which returns a real `zone_id`
UUID, not a slug. Confirmed by reading `src/domain/simulation/
generator.py`: neither `generate_sensor_readings` nor
`generate_permits` calls `resolve_id()` on `zone_key`/
`authorizing_officer_key` - they thread the string through as an
opaque tag, and `reading_id`/`permit_id` are derived from `scenario.seed`
+ `event.name`, never from `zone_key`'s content. So
`src/services/scenario_builder.py` puts `str(existing_zone_id)` in
that field and parses it back with plain `uuid.UUID(...)`, never
`resolve_id()`. This is not a frozen-interface change: the field's
frozen type (`str`) is satisfied either way, and the frozen dataclass,
`validate_structure()`, and `generate_sensor_readings`/
`generate_permits` are called completely unmodified.

## Validation - three layers, one authority

1. **Client-side, instant** (`frontend/src/lib/scenarioBuilderValidation.ts`) -
   an independent TypeScript mirror of the same rules, for immediate
   UI feedback without a round trip. Same discipline as `lib/tier.ts`'s
   own independent `TIER_ORDER` copy.
2. **`POST /scenario-builder/validate`, structural** - calls the frozen
   `validate_structure()` completely unmodified (duplicate names,
   sim_time/duration sanity, curve/param validity).
3. **`POST /scenario-builder/validate`, reference + domain** -
   `validate_builder_scenario()` (new, `src/services/
   scenario_builder.py`, not frozen) checks zone/sensor/worker
   existence (adapted for `uuid.UUID(...)` parsing rather than
   `resolve_id()`), an authorizing officer's current zone assignment
   ("worker outside every zone"), and negative-concentration detection
   by calling the frozen, pure `generate_sensor_readings()` and
   checking its actual output values - never re-deriving the curve
   math itself.

`POST /scenario-builder/validate` is the sole authority before
execution; the client-side copy exists only for UX.

## Execution - this platform's first write endpoint

Every endpoint before this milestone was `GET`. `POST /scenario-builder/
execute`:

1. Re-validates (same path as `/validate`) - nothing is written if invalid.
2. Persists sensor readings and permits by calling the frozen
   `generate_sensor_readings`/`generate_permits` and the already-existing
   `_compute_baseline_snapshot` (`src/services/simulation_runner.py`,
   reused unchanged, not duplicated).
3. Runs every reading through `run_zone_tick`
   (`src/services/risk_pipeline.py`, unchanged) in timestamp order,
   grouped by zone, threading `AgentCache`/`TierState` forward - the
   exact tick-by-tick driver every pre-authored scenario replay uses.

**Ephemeral by design** (the approved scope): an executed scenario is
not written to `scenarios/*.yaml` and never appears in the Scenario
Library catalog. Each zone starts a fresh `AgentCache`/`TierState` for
the run, matching how every existing scenario replay already works.

## Deliverables

- Backend: `src/api/routers/{workers,scenario_builder}.py`,
  `src/api/schemas/{workers,sensors,equipment,scenario_builder}.py`,
  `src/services/scenario_builder.py`, `WorkerRepository.list_all()`,
  two new routes on `zones.py` (`/sensors`, `/equipment`).
- Frontend: `pages/ScenarioBuilderPage.tsx`, `components/
  scenarioBuilder/TimelineEditor.tsx`, `lib/scenarioBuilderValidation.ts`,
  `lib/scenarioBuilderPreview.ts`, `hooks/useScenarioBuilder.ts`,
  `api/scenarioBuilder.ts`, `apiPost` added to `api/client.ts`.
- Tests: `tests/unit/test_scenario_builder.py`,
  `tests/integration/test_scenario_builder_api.py` (14 integration + 3
  unit, backend); `lib/scenarioBuilderValidation.test.ts`,
  `lib/scenarioBuilderPreview.test.ts` (11 + 4, frontend).
- Export/Import: client-side only, JSON matching
  `ScenarioDefinitionInput`'s shape - no backend round trip needed for
  either.

## Live verification

Full flow exercised against the running dev backend/frontend: added a
Tank Farm CH4 sensor event (`linear_ramp`, baseline 2, leak rate 0.5)
and a hot-work permit issued mid-rise, validated client-side and via
the backend, executed, and confirmed via `GET /risk/current` that a
real `RiskAssessment` was persisted - tier CRITICAL, score 100.0, with
`interaction_bonus_applied: 1.8` from the same gas-rise +
concurrent-hot-work-permit compounding effect every other scenario in
this platform demonstrates. Export/Import round-trip verified
(exported JSON re-imported correctly restores form state and
timeline).
