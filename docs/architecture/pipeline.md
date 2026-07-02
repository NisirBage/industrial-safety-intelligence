# The complete deterministic pipeline

Documentation only — responsibilities and data flow from simulated
sensor data through to a persisted risk assessment. See
`docs/architecture/*.md` and `docs/algorithms/*.md` for the pieces
this ties together, `docs/architecture/frozen_interfaces.md` for what
each stage's output type is now frozen to mean, and
`docs/architecture/integration_readiness.md` for what remains to be
built.

Every section below is labeled **Implemented**, **Planned**, or
**Deferred**:

- **Implemented** — built, tested, and (per the Architecture
  Checkpoint) frozen. Not expected to change except for a genuine
  correctness defect, which would itself require a review before any
  fix.
- **Planned** — named in the Master Plan, not yet started, no code
  exists for it.
- **Deferred** — explicitly postponed at the milestone where it would
  otherwise have been built, with the reason recorded at that
  milestone (not a silent gap).

## Simulation — **Implemented**

`src/domain/simulation/` generates physically-plausible synthetic
readings and events from an authored scenario file, deterministically
and reproducibly (same seed, same output, always). This is the only
place in the pipeline that *creates* data rather than reasoning about
data that already exists.

## Repository layer — **Implemented**

`src/infra/db/repositories/` persists simulated readings and exposes
typed queries. Nothing above this layer touches SQL or a session
directly — every repository method is the only path in or out of the
database for its entity.

## Context Builders — **Implemented**

`src/services/context_builders.py` queries the repository layer and
assembles each agent's complete `AgentInput` per zone, per tick.
Nothing in `src/domain/orchestrator/scheduler.py` builds this itself —
it only ever invokes whatever `ContextBuilder` callable it is given;
every callable here is a closure factory (`make_*_context_builder`)
constructed once per tick by `src/services/risk_pipeline.py`, which
supplies the `Session` and any per-zone configuration (Gas Risk's
`gas_type`) via closure. Worker Exposure's `PermitCoverage` is derived
from Permit Intelligence's own same-tick `AgentResult`, exactly as
`docs/architecture/execution_graph.md` specified at M5A; Permit
Intelligence's SIMOPS check reads each adjacent zone's Gas Risk
contribution from its most recently *persisted* `RiskAssessment`,
never a second same-tick orchestration pass.

## Scheduler — **Implemented**

`src/domain/orchestrator/scheduler.py` runs the four agents in
dependency order (three levels, not two — Permit Intelligence before
Worker Exposure) for one zone, one tick, substituting a decayed
last-known value for anything that failed rather than excluding it.

## Agent execution — **Implemented**

Each agent (`src/domain/agents/`) is a pure, stateless function of its
own `AgentInput`: Gas Risk (a saturating curve over sensor readings),
Equipment Status (a common-cause-aware degradation count), Worker
Exposure (headcount weighted by upstream Gas Risk), Permit
Intelligence (an escalation-only status state machine). Every agent
returns a common `AgentResult` — risk, confidence, and a self-
contained justification — regardless of how different its underlying
math is.

## Fusion — **Implemented**

`src/domain/orchestrator/risk_formula.py` combines all four
`AgentResult`s into one `FusionResult`: a weighted sum of their risk
scores, multiplied by an interaction bonus that grows with how many
agents are simultaneously elevated. This is the one place the
"compound risk" claim actually becomes a number — it consumes the
scheduler's output only, never executes an agent itself.

## Tiering — **Implemented**

`src/domain/orchestrator/tiering.py` converts `FusionResult.compound_risk_score`
into a stable per-zone `TierState` (normal/watch/elevated/critical)
using asymmetric hysteresis and dwell-time, so a score wobbling near
a threshold doesn't flicker between tiers every tick. It never
recomputes risk — only Fusion's already-computed score goes in.

## Justification Builder — **Implemented**

`src/domain/orchestrator/justification.py` combines the scheduler's
raw `AgentResult`s, `FusionResult`, and a tier transition
(`tier_before`/`tier_after`, passed as plain strings — this module
never imports `TierState` itself) into `RiskAssessmentJustification`,
the object matching the `risk_assessments.justification` schema
exactly — the one object that will later feed the audit log (M6) and
the RAG agent (M11) simultaneously, without either needing to
reconstruct it independently.

## Counterfactual Comparator — **Implemented** (parallel branch, not part of this chain)

`src/domain/orchestrator/counterfactual.py` is not a stage in the
chain above — it is a separate, independent branch off the same raw
sensor readings that feed Gas Risk Agent, sharing no code with any
other module in this diagram (enforced by a permanent structural
test, not just this description). Where the real pipeline computes a
continuous, compounding score, this module answers one narrow
question with a hard trip point: would a naive single-sensor alarm
system, judging each sensor alone with no fail-safe handling of
missing or stale data, have alerted on the identical tick?

## `RiskAssessment` persistence — **Implemented**

`src/services/risk_pipeline.py`'s `run_zone_tick()` writes one row per
zone per tick — `compound_risk_score`, `confidence`, `tier`, and the
serialized `RiskAssessmentJustification` — through
`RiskAssessmentRepository.create()`. `assessment_id` is derived
deterministically from `(zone_id, sim_time)` (the same UUIDv5 pattern
`src/domain/simulation/ids.py` already established), so re-running an
identical tick overwrites the same row rather than duplicating it.
Migration 0002 widened `risk_assessments.tier`'s `CHECK` constraint to
include `"normal"` — the table's original three-value constraint
predated the Tiering Engine and would have rejected the majority of
ticks otherwise.

## Comparison (Counterfactual vs. compound engine) — **Implemented** (observability only)

`run_zone_tick()` runs Counterfactual in its own session, after the
compound engine's transaction has already committed, and logs the
compound tier alongside `CounterfactualResult.alert` for the same
tick. This is an observability hook, not a persisted entity — the
DB-backed golden-scenario test that replays the authored demo scenario
end to end and asserts the compound engine reaches CRITICAL while
Counterfactual's alert stays `False` throughout (Master Plan M5 task
6) remains **Deferred**: it needs a full scenario replay through this
pipeline, not just the per-tick fixtures this milestone's own test
suite uses. A later demo/UI panel (M14) is the other intended reader
of this comparison, also deferred.

## REST API — **Implemented**

`src/api/routers/{risk,permits,audit}.py` expose `GET /risk/current`,
`/risk/history/{zone_id}`, `/permits`, and `/audit` — read-only,
orchestrating only (validate → repository call → shape response), per
`docs/architecture/CORE_FREEZE.md`'s contracts. `/audit` reads an
always-empty table for now: the hash-chained audit-log writer was
explicitly deferred when this milestone was scoped. Verified without
a live database in the End-to-End Integration Verification milestone
(shared error contract, pagination, and OpenAPI generation all
confirmed via `TestClient`); verification against actual populated
data requires a Docker-capable environment, which this sandbox does
not have — see `docs/architecture/integration_readiness.md`.

## WebSocket / Frontend — **Planned**

Master Plan M7 (WebSocket) and M8 (frontend shell) are named, scoped
milestones with no code yet. See
`docs/architecture/integration_readiness.md` and
`docs/architecture/integration_checklist.md` for their dependencies
and current status.

## Data flow, end to end

```
scenario file
     |
     v
Simulation
     |
     v
Repositories (sensor_readings, permits)
     |
     +-----------------------------------------------+
     v                                                 v
Context Builders                              Counterfactual Comparator
     |                                          (independent branch,
     v                                           own session, runs after
Scheduler                                        the compound engine
(runs 4 agents in 3 dependency levels)           commits below)
     |                                                    |
     v                                                    v
dict[str, AgentResult]                          CounterfactualResult
     |                                                    |
     v                                                    |
Fusion  -----------> FusionResult                         |
     |                     |                              |
     v                     |                              |
Tiering  <------------------                              |
     |                                                     |
     v                                                     |
TierState (before/after)                                   |
     |                                                     |
     v                                                     |
Justification Builder                                      |
     |                                                     |
     v                                                     |
Persistence: RiskAssessment  -- commit -->  Comparison (log only)
     |
     v
REST API (GET /risk/current, /risk/history/{zone_id}, /permits, /audit)
     |
     v
WebSocket / Frontend (planned)
```

Every arrow above is a deterministic, side-effect-free function call
except the "Repositories" boundary and the "Persistence" write — the
only places in the entire pipeline where I/O happens. Context Builders
and Counterfactual both read from Repositories directly; Counterfactual
never receives the Scheduler's or Context Builders' output, and they
never receive its — `src/services/risk_pipeline.py` (the box this
whole diagram now represents, from Context Builders through
Comparison) opens one `get_session()` transaction spanning everything
from Context Builders through the Persistence write, and a second,
separate session for Counterfactual afterward, so neither branch's
failure can affect the other's already-committed or already-returned
result.
