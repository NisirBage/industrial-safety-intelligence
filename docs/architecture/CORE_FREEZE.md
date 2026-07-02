# Core Freeze Record

The canonical, single-page reference for what "the deterministic
engine" means from this point forward. Every other architecture and
algorithm document remains the detailed source of truth for its own
topic — this document is the index and the contract, not a
replacement for `docs/architecture/frozen_interfaces.md`,
`docs/architecture/invariants.md`, or `docs/algorithms/*.md`.

## 1. Engine Version

**Deterministic Core v1.0** — a documentation designation, not a
package version (no version field exists elsewhere in this project).
Identifies the complete, closed set of work covered by this freeze:
M0–M5 (Simulation, Data Model, Agents, Permit Intelligence, Scheduler,
Fusion, Tiering), the Justification Builder, the Counterfactual
Comparator, and the System Integration Layer (Context Builders +
Risk Pipeline).

## 2. Freeze Date

2026-07-02 — the date of the Verification & Architecture Audit's
**APPROVED WITH OBSERVATIONS** verdict, the last checkpoint before M6.

## 3. Frozen Modules

```
src/domain/agents/base.py
src/domain/agents/gas_risk.py
src/domain/agents/equipment_status.py
src/domain/agents/worker_exposure.py
src/domain/agents/permit_intelligence.py
src/domain/orchestrator/scheduler.py
src/domain/orchestrator/risk_formula.py
src/domain/orchestrator/tiering.py
src/domain/orchestrator/justification.py
src/domain/orchestrator/counterfactual.py
src/domain/simulation/{ids,clock,curves,scenario,generator}.py
```

`src/services/context_builders.py` and `src/services/risk_pipeline.py`
are **not** frozen in the same sense — they are orchestration/wiring
code that calls the frozen modules above. They may be extended
(e.g. a new context builder for a fifth agent) without an ADR, so
long as they never duplicate a frozen module's computation
(§9–§11 below).

## 4. Frozen Public Interfaces

Full detail in `docs/architecture/frozen_interfaces.md`; named here
for a single-glance index: `Agent`, `AgentInput`, `AgentResult`,
`Justification`, `ExecutionPlan`/`ExecutionLevel`, the Scheduler
(`run_tick`, `SchedulerConfig`, `ContextBuilder`, `AgentCache`,
`NoLastKnownResultError`), `FusionResult`/`AgentContribution`,
`TierState`, `RiskAssessmentJustification`, `CounterfactualResult`/
`CounterfactualReading`.

Verified byte-identical to their milestone-commit state as of the
Verification & Architecture Audit (`git show <commit>:<file> | diff`
for every committed one; no `Edit`/`Write` call has touched
`justification.py`/`counterfactual.py` since they were authored).

## 5. Frozen Mathematical Models

Full derivations in `docs/algorithms/*.md` and
`docs/architecture/mathematical_model.md`; the models themselves,
summarized:

- **Saturating risk family**, `100 × (1 − e^(−k·x))`, independently
  parameterized in Gas Risk (`x` = reading/threshold), Equipment
  Status (`x` = degraded-group ratio), and Worker Exposure (`x` =
  tier-weighted headcount) — three independent applications of the
  same functional shape, never a shared formula call.
- **Gas Risk staleness decay**: `elevated_floor + (raw − elevated_floor)·e^(−λΔt)`.
- **Permit Intelligence**: categorical policy (`assess_baseline_delta`,
  `detect_simops_conflicts`, escalation-only `determine_recommended_status`),
  mapped onto the 0–100 scale via `risk_by_status`.
- **Fusion**: `R_base = Σ(w_i·r_i)`, `R_compound = min(100, R_base·(1 + κ·max(0, n−1)))`.
- **Tiering**: asymmetric hysteresis (`de_escalation_margin`) + dwell-time
  (`dwell_ticks`) gating the tier value itself, per
  `docs/architecture/mathematical_model.md`.
- **Confidence aggregation**: minimum across independent factors,
  applied identically at every level from a single agent's internal
  factors up through Fusion's cross-agent combination — never an
  average, without exception, anywhere in the engine.
- **Counterfactual**: a hard trip point, `value ≥ alarm_threshold`,
  per sensor, `any(...)` at the zone level — deliberately the only
  model in this engine with no saturating curve and no confidence
  concept, since that absence is the entire point of the comparison.

## 6. Integration Contracts

- **Context Builder contract**: a function matching
  `Callable[[zone_id, sim_time, tick_id, results_so_far], AgentInput]`
  exactly; assembles only, computes nothing (§8, Integration
  Invariants).
- **Repository contract**: typed query/write methods only, no
  business logic, the sole path in or out of the database for their
  entity.
- **Persistence contract**: `RiskAssessment.justification` must match
  `RiskAssessmentJustification`'s six fields exactly —
  `schema_version`, `rules_fired`, `agent_contributions`,
  `interaction_bonus_applied`, `tier_before`, `tier_after` — not
  enforced by the database (JSONB is schemaless), enforced by
  `_serialize_justification()` and this document.
- **`RiskAssessment.tier` contract**: one of `normal`/`watch`/
  `elevated`/`critical` (migration 0002), matching `TIER_ORDER`
  exactly.
- **Cross-zone contract**: an adjacent zone's Gas Risk signal for
  SIMOPS is read from that zone's most recently *persisted*
  `RiskAssessment`, never a same-tick computation — the resolution
  to the single-zone scheduler's inherent scope limit.

## 7. Determinism Guarantees

- No `random.*` anywhere in `src/`.
- No wall-clock call (`datetime.now()`, `datetime.utcnow()`,
  `time.time()`) in `src/domain` or `src/services` — enforced by an
  AST-walking test (`tests/unit/test_no_wallclock_calls.py`), not a
  convention.
- All entity/scenario/assessment identifiers are derived via
  `resolve_id()` (deterministic UUIDv5), never `uuid.uuid4()`, in
  every code path actually exercised. (One latent exception is
  documented in §12.)
- `SimClock` is the only notion of "now" during simulation; every
  other module receives time as an ordinary `sim_time` argument.
- Identical inputs (including identical database state) produce
  identical outputs at every stage — proven by dedicated determinism
  tests in every agent's, Fusion's, Tiering's, Justification's,
  Counterfactual's, and the Risk Pipeline's own test suite.

## 8. Architectural Invariants

The complete list lives in `docs/architecture/invariants.md`
(deterministic execution, stateless agents, no business logic in
repositories, immutable baseline snapshots, conservative confidence
propagation, escalation-only policy, no wall-clock usage,
explainability requirements) plus its **Integration invariants**
section added at the System Integration Layer:

- Context Builders never compute domain logic.
- Repositories never compute domain logic.
- Scheduler never queries repositories.
- Fusion never executes agents.
- Tiering never recomputes risk.
- Justification never recomputes anything.
- Counterfactual never depends on compound risk.
- Risk Pipeline only orchestrates.

All are mandatory, not aspirational, and were independently verified
(not just asserted) during the Verification & Architecture Audit.

## 9. Allowed Future Changes

- Adding a new agent: a new module under `src/domain/agents/`, a new
  `ContextBuilder`, a new entry in `EXECUTION_PLAN`/`FusionConfig.agent_weights`
  (kept in sync by `risk_pipeline.py`'s own startup assertion) — additive,
  no ADR required if it follows the established agent pattern exactly.
- Tuning a documented "proposed, not cited" calibration constant
  (full list in `docs/architecture/integration_readiness.md`) — a
  config-value change, not a code change, does not require an ADR by
  itself, but should be recorded wherever that constant's rationale
  is documented.
- Adding a new diagnostic-only field to `CounterfactualResult` (the
  precedent `highest_ratio` already set) — provided it never gates
  `alert`.
- Extending `src/services/*.py` with new orchestration (e.g. a
  repeating tick-loop driver, a new context builder for a future
  agent) — this layer is wiring, not frozen math.

## 10. Changes Requiring ADR Approval

- Any change to a frozen interface's field names, types, or semantics
  (even an addition) — per `docs/architecture/frozen_interfaces.md`'s
  own per-interface "allowed future changes" column.
- Consolidating the five independently-duplicated WATCH/ELEVATED/CRITICAL
  threshold copies into a shared constant — a real architectural
  change to a discipline this project has held since M3C, not a
  drive-by edit.
- Resolving the multi-sensor-per-zone limitation in Gas Risk or
  Counterfactual's context assembly.
- Deciding where `AgentCache`/`TierState` persist across process
  restarts (in-process vs. Redis-backed).
- M12's Isolation Forest integration touching `GasRiskConfig`/
  `calculate_risk` — the anomaly-score extension point the Master Plan
  assumed does not exist; adding one is a frozen-interface change.
- Any change to the `RiskAssessment.justification` or `.tier` JSONB/
  CHECK contract beyond migration 0002's already-applied fix.

## 11. Explicitly Prohibited Changes

- Renaming, removing, or reordering any field on `AgentResult`,
  `Justification`, `FusionResult`, `TierState`,
  `RiskAssessmentJustification`, or `CounterfactualResult`.
- `risk` leaving the 0–100 scale, or `confidence` leaving the 0–1
  scale, anywhere.
- Averaging confidence instead of taking the minimum, anywhere.
- Any agent calling another agent's `evaluate()` directly, bypassing
  `upstream_results`.
- The Scheduler importing a repository, or performing fusion/tiering
  itself.
- Fusion or Tiering executing an agent or querying a repository.
- Justification recomputing risk, confidence, or a tier decision
  instead of reshaping already-computed values.
- Counterfactual importing, calling, or otherwise sharing code with
  any compound-engine module (`scheduler.py`, `risk_formula.py`,
  `tiering.py`, `justification.py`, or any agent) — enforced by a
  permanent structural test, not just this rule.
- Introducing `uuid.uuid4()`, `random.*`, or a wall-clock call into
  any code path actually exercised by `src/domain` or `src/services`.
- Context Builders or the Risk Pipeline containing a saturating
  curve, a threshold comparison against a risk value, a confidence
  calculation, or a tiering decision.

## 12. Known Limitations

- `uuid.uuid4()` remains the SQLAlchemy column-level default on every
  ORM model's primary key (pre-existing since M1). Inert today — every
  real call site supplies a deterministic id explicitly — but latent:
  a future caller that omits an explicit id would silently get a
  random one.
- Gas Risk's context builder and Counterfactual's reading assembly
  both assume at most one monitored gas type per zone, matching
  today's seed data exactly but unenforced by the schema.
- `AgentCache`/`TierState` have no decided persistence store across
  process restarts.
- M12's assumed Gas Risk `anomaly_score` extension point does not
  exist in the frozen code (Master Plan's own assumption, never
  built).
- The DB-backed golden-scenario + counterfactual integration test
  (Master Plan M5 task 6) remains deferred — needs a full scenario
  replay through `risk_pipeline.py`, not yet written.
- No integration test yet exercises a mid-run agent-decay path
  through the full Risk Pipeline end to end (the mechanism itself is
  unit-tested at the Scheduler level).

## 13. Remaining Project Roadmap

Per `docs/architecture/integration_checklist.md` (kept as the living,
detailed tracker; summarized here):

1. **M6** — Audit log (hash-chained) + core REST API. Next, unblocked.
2. **M7** — WebSocket streaming (Redis pub/sub).
3. **M8** — Frontend shell & state management.
4. **M9–M13** — Heatmap, Alerting, RAG, Isolation Forest/YOLO overlay,
   Auth/RBAC — largely parallelizable once M8 exists.
5. **M14** — Demo scenario assembly, counterfactual panel, deployment
   polish (last, depends on everything).

None of M6–M14 touch the frozen engine's algorithms; all of them
*consume* it through the contracts in §6.

## 14. Verification Status

- **Architecture Checkpoint** (post-Counterfactual Comparator):
  accepted unchanged, no defects found.
- **Verification & Architecture Audit** (post-System Integration
  Layer): **APPROVED WITH OBSERVATIONS** — zero defects, a short list
  of documented, non-blocking risks and one test-coverage gap (§12
  and `docs/architecture/integration_readiness.md`'s Risk Register).
- Full validation suite at freeze time: `ruff`, `black --check`,
  `mypy` (strict), and the complete `pytest` run all green, modulo the
  standing, expected `psycopg.OperationalError` set on DB-backed
  integration tests (no live database in this environment) —
  unchanged in kind since M1.

## 15. Final Engineering Sign-off

The deterministic engine — Simulation, the four agents, the
Scheduler, Fusion, Tiering, the Justification Builder, the
Counterfactual Comparator, and the Context Builders/Risk Pipeline that
wire it to persistence — is frozen as of this document. It has passed
two independent, evidence-based audits with no correctness defects
found. Every public interface, every mathematical model, and every
architectural invariant named above is to be treated as stable
infrastructure by all future milestones.

From this point forward, this engine is **read-only**: no
modification to any file listed in §3, no change to any interface
listed in §4, and no change to any model listed in §5 is permitted
except (a) a genuine correctness defect, reported and fixed through
the same Architecture Review discipline used throughout this project,
or (b) a change explicitly approved via an ADR per §10. All other work
proceeds by building on top of this engine through the contracts in
§6, never by editing it.
