# Frozen interfaces

Documentation only. The deterministic decision engine (Simulation,
Agents, Scheduler, Fusion, Tiering, Justification, Counterfactual) is
architecturally frozen as of the Architecture Checkpoint following the
Counterfactual Comparator milestone. This document names every public
interface that freeze covers, so that all remaining integration work
(context builders, persistence, the API, the frontend) knows exactly
what it may rely on and exactly what it may never assume it can
change.

**General rule for every interface below:** a field, method signature,
or type may never be renamed, removed, or have its semantics (scale,
units, nullability, aggregation rule) changed without an explicit
Architecture Review and a new milestone — the same discipline that has
held since M3A. An *additive*, backward-compatible change (a new
optional field, a new helper function alongside existing ones) is the
only category of change these interfaces can accept without that
review, and even that requires the owning module's `algorithm_version`
or `schema_version` field to be bumped so consumers can detect it.

---

## `Agent` (Protocol)

- **Purpose:** the one contract every risk agent implements, so the
  scheduler can treat all four agents interchangeably regardless of
  their internal math.
- **Owner module:** `src/domain/agents/base.py` (M3A).
- **Consumers:** `GasRiskAgent`, `EquipmentStatusAgent`,
  `WorkerExposureAgent`, `PermitIntelligenceAgent` (all implement it);
  `src/domain/orchestrator/scheduler.py` (`ExecutionLevel.agents`,
  `build_default_execution_plan()` are typed against it).
- **Allowed future changes:** none identified. Lifecycle hooks
  (`initialize`/`before_tick`/`after_tick`) were explicitly considered
  and rejected as premature (M3A clarification 10) — adding one would
  require a concrete, approved requirement first.
- **Prohibited changes:** changing `evaluate()`'s signature or making
  it synchronous; removing the `metadata` attribute; adding a required
  constructor parameter to the protocol itself (it has none — each
  agent's own `__init__` is unconstrained by this protocol, and must
  stay that way).

## `AgentInput`

- **Purpose:** everything one agent needs for one zone, one tick, and
  nothing it should fetch for itself.
- **Owner module:** `src/domain/agents/base.py` (M3A).
- **Consumers:** every agent's `evaluate()`; `ContextBuilder`'s return
  type (`scheduler.py`).
- **Allowed future changes:** none currently justified.
  `context: Mapping[str, object]` is deliberately open-ended so new
  per-agent data needs are satisfied without touching this dataclass —
  that flexibility is why no field has needed to change since M3A.
- **Prohibited changes:** narrowing `context`'s type away from a
  generic mapping; changing `upstream_results` to anything other than
  `Mapping[str, AgentResult]` keyed by agent name; adding a field that
  would let an agent reach a repository or clock directly.

## `AgentResult`

- **Purpose:** the one return shape every agent produces — risk,
  confidence, justification, timestamp — regardless of domain.
- **Owner module:** `src/domain/agents/base.py` (M3A).
- **Consumers:** `scheduler.py` (`AgentCache`, `run_tick`'s return
  dict); `risk_formula.py` (`calculate_agent_contributions`,
  `calculate_compound_confidence`); `justification.py`
  (`build_rules_fired` reads `.justification.rules_fired`);
  `worker_exposure.py` and `permit_intelligence.py` read
  `upstream_results["gas_risk"].risk`/`.confidence`.
- **Allowed future changes:** `schema_version` exists precisely to let
  a future serialization change (persistence, the M7 WebSocket
  envelope) be versioned without breaking this type itself.
- **Prohibited changes:** `risk` leaving the 0–100 scale; `confidence`
  leaving the 0–1 scale; removing `justification`; changing
  `computed_at`'s semantics away from "the sim-time this result was
  actually computed at" (the scheduler's staleness decay depends on
  this being genuine, never a decayed value's own re-stamped time).

## `Justification` (per-agent)

- **Purpose:** an agent's own explanation for its own result —
  distinct from the post-fusion `RiskAssessmentJustification` below.
- **Owner module:** `src/domain/agents/base.py` (M3A).
- **Consumers:** every agent's `build_justification()` constructs one;
  `justification.py`'s `build_rules_fired()` reads `.rules_fired` from
  each agent's copy.
- **Allowed future changes:** `evidence`'s type
  (`dict[str, object] | None`) is deliberately unconstrained, so new
  per-agent evidence needs don't require a type change here.
- **Prohibited changes:** removing `summary` or `rules_fired`; making
  `rules_fired` anything other than an ordered list (Justification
  Builder's aggregation depends on order being meaningful).

## `FusionResult`

- **Purpose:** Fusion's complete output — compound score, confidence,
  per-agent contributions, and the interaction bonus actually applied.
- **Owner module:** `src/domain/orchestrator/risk_formula.py` (M5B).
- **Consumers:** `tiering.py` (`transition()` reads
  `.compound_risk_score`); `justification.py`
  (`build_agent_contributions()` reads `.agent_contributions`,
  `.interaction_bonus_applied`, `.rules_fired`).
- **Allowed future changes:** none currently justified. It
  deliberately omits `tier`/`tier_before`/`tier_after` — those require
  the separately-built hysteresis state machine and travel as plain
  strings into Justification, not as fields added here.
- **Prohibited changes:** `compound_risk_score` leaving 0–100;
  `confidence` leaving 0–1 or becoming anything other than a minimum
  across agents; reordering or renaming `AgentContribution`'s fields
  (`agent_name`, `raw_risk`, `weight`, `weighted_contribution`,
  `confidence`) — Justification reshapes exactly these into the frozen
  persistence schema and would silently break if they moved.

## `TierState`

- **Purpose:** the stable, hysteresis-and-dwell-gated per-zone tier
  (`normal`/`watch`/`elevated`/`critical`), persisted across ticks.
- **Owner module:** `src/domain/orchestrator/tiering.py` (M5C).
- **Consumers:** none yet *within* the domain layer — by design.
  `justification.py` never imports `TierState`; a future services-
  layer caller is expected to thread `TierState` across ticks itself
  and pass only `.current_tier` (as `tier_before` and `tier_after`,
  two plain strings) into
  `build_risk_assessment_justification()`. This is a deliberate
  decoupling, not an oversight — see `docs/architecture/pipeline.md`.
- **Allowed future changes:** none currently justified.
- **Prohibited changes:** `current_tier` leaving the four-value set
  `TIER_ORDER` defines; `entry_threshold` losing its "the threshold
  associated with `current_tier` itself" meaning (the de-escalation
  margin is computed against exactly this).

## `RiskAssessmentJustification`

- **Purpose:** the exact, frozen `risk_assessments.justification`
  JSONB shape (Master Plan A.4) — the one object the audit log (M6)
  and the RAG agent (M11) will both read.
- **Owner module:** `src/domain/orchestrator/justification.py`
  (Justification Builder milestone).
- **Consumers:** none yet — the services-layer writer that persists
  `RiskAssessment` rows (M6) is not built. This type's shape is the
  contract that writer must satisfy exactly.
- **Allowed future changes:** **none without also updating
  `src/infra/db/models/risk_assessment.py`'s docstring contract and
  getting that change separately approved** — this type's whole
  purpose is exact conformance to a schema frozen at M1. A field
  cannot be added here without first deciding it belongs in the
  persisted JSONB shape too.
- **Prohibited changes:** any field rename, removal, or type change;
  changing `agent_contributions`'s shape away from
  `{agent_name: {"risk": float, "confidence": float}}`.

## `CounterfactualResult`

- **Purpose:** one zone's naive single-sensor-baseline verdict for one
  tick — the independent comparison value, never persisted, never fed
  back into the compound engine.
- **Owner module:** `src/domain/orchestrator/counterfactual.py`
  (Counterfactual Comparator milestone).
- **Consumers:** none yet — a future test (the deferred golden-
  scenario + counterfactual integration test, Master Plan M5 task 6)
  and, later, a demo/UI panel (M14) are its only intended readers.
- **Allowed future changes:** `highest_ratio` was already introduced
  as purely diagnostic; further diagnostic-only fields could follow
  the same rule (never gates `alert`) without disturbing the
  comparison semantics.
- **Prohibited changes:** anything that makes `alert` depend on
  compound-engine output, cross-sensor correlation, or any fail-safe
  behavior — that would silently turn the "naive" baseline into
  something no longer naive, invalidating the entire comparison it
  exists to make.

## `ExecutionPlan` / `ExecutionLevel`

- **Purpose:** the static, explicitly-declared three-level dependency
  graph the four agents run under.
- **Owner module:** `src/domain/orchestrator/scheduler.py` (M5A).
- **Consumers:** `run_tick()`; `build_default_execution_plan()`
  constructs the canonical instance; a future services-layer caller
  holds the constructed plan for the lifetime of the process.
- **Allowed future changes:** adding a fifth agent means writing a new
  explicit level assignment (a new call to construct an
  `ExecutionPlan`), never adding runtime dependency discovery to this
  type itself (M5A clarification 2 rejected that explicitly).
- **Prohibited changes:** anything that makes level assignment
  computed/inferred rather than explicitly authored.

## Scheduler (`run_tick`, `ContextBuilder`, `SchedulerConfig`, `NoLastKnownResultError`)

- **Purpose:** runs one tick of the execution plan, level by level,
  substituting a decayed last-known value for any agent that fails.
- **Owner module:** `src/domain/orchestrator/scheduler.py` (M5A).
- **Consumers:** `src/services/risk_pipeline.py`'s `run_zone_tick()`
  is the only caller of `run_tick()`, once per zone, per tick.
- **Allowed future changes:** `SchedulerConfig`'s
  `staleness_decay_lambda` is a calibration constant and may be tuned
  with approval; the retry/fallback *policy* itself (last-known +
  accelerated decay, never exclusion) is not open for change without
  an Architecture Review, since it directly implements the "a missing
  input is itself informative, not neutral" rule (Technical Review
  4.5).
- **Prohibited changes:** `run_tick()`'s signature; the "never mutate
  `previous_cache` or any input" determinism guarantee; the "no
  last-known value → raise, never fabricate" rule.

## `AgentCache`

- **Purpose:** an immutable, cross-tick record of every agent's last
  *genuine* success, threaded explicitly (`previous_cache → new
  cache`) rather than held as hidden state.
- **Owner module:** `src/domain/orchestrator/scheduler.py` (M5A).
- **Consumers:** `run_tick()` (read and returned each call);
  `run_zone_tick()` (`src/services/risk_pipeline.py`) takes and
  returns it explicitly but does not persist it anywhere itself —
  whether a future repeating caller holds it in process memory or an
  external store remains open (see
  `docs/architecture/integration_readiness.md`).
- **Allowed future changes:** none currently justified.
- **Prohibited changes:** ever writing a decayed substitute into the
  cache (`with_result()` must only ever be called with a genuine
  success) — this is the specific mechanism that prevents decay from
  compounding across consecutive failures, verified by a dedicated
  test since M5A.
