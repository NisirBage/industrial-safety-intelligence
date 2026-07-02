# Integration readiness review

> **Engine status: FROZEN.** See `docs/architecture/CORE_FREEZE.md`
> for the canonical freeze record (version, frozen modules/interfaces/
> models, contracts, and what is and isn't allowed to change from
> here). This document remains the living, detailed tracker for the
> remaining integration work that *consumes* the frozen engine.

Documentation only. Assesses what the frozen deterministic engine
(M0–M5, Justification, Counterfactual, System Integration Layer) hands
off to the remaining infrastructure work, and what that work still
needs to supply.

## Current completed subsystems

- **M0** — repo scaffold, config, FastAPI health route, CI, lint/format/type wiring.
- **M1** — data model, migrations, 9 repositories, seed data.
- **M2** — deterministic simulation engine and synthetic data generator.
- **M3 (A–D)** — Gas Risk, Equipment Status, Worker Exposure agents, and
  the shared `Agent`/`AgentInput`/`AgentResult` contract.
- **M4 (A–B)** — Permit Intelligence reasoning framework and agent.
- **M5 (A–C)** — Scheduler, Fusion, Tiering.
- **Justification Builder** — frozen-schema justification assembly.
- **Counterfactual Comparator** — independent naive-baseline branch.
- **System Integration Layer** — `src/services/context_builders.py` and
  `src/services/risk_pipeline.py` wire the frozen engine to the
  database: repositories → context builders → scheduler → fusion →
  tiering → justification → `RiskAssessment` persistence → commit →
  Counterfactual → comparison logging, per zone per tick.
- **M6 — Core REST API** — `GET /risk/current`, `/risk/history/{zone_id}`,
  `/permits`, `/audit` (read-only for this pass; the hash-chained
  audit-log writer remains deferred), shared pagination and error
  contract, OpenAPI documentation.
- **End-to-End Integration Verification & Production Hardening**
  ("M7" in this session's own numbering, not the Master Plan's M7) —
  verified everything executable without a live database: full
  validation suite, static review of `docker-compose.yml` and both
  migrations, and direct empirical confirmation that the same
  scheduler→Fusion→Tiering→Justification input produces byte-identical
  output across independent runs. Docker/PostgreSQL were unavailable in
  this sandbox at the time, so live-database checks could not be
  executed then - since resolved, see "M9" below.
- **M8 — Frontend Dashboard Integration** — a pure-consumer React
  dashboard (Overview/Zone/Permit/Audit views) built against M6's REST
  API, with one centralized `frontend/src/api/` layer and no
  duplicated business logic. Two missing-backend-capability findings
  were reported rather than worked around: no simulation-trigger
  endpoint, no zone-name endpoint (both remain unimplemented,
  documented in `docs/frontend/README.md`).
- **M9 — Full System Integration & Live Infrastructure Verification** —
  the first milestone in this project's history verified against a
  real, running PostgreSQL instance and a real, running frontend+backend
  pair in a browser. Found and fixed two genuine defects (both
  approved and resolved before this freeze note was written): a
  migration-0002 `downgrade()` bug that failed whenever a `'normal'`-tier
  row existed, and a missing CORS configuration that silently blocked
  every browser request from the M8 dashboard to the API. See
  "Verification results" below for what was actually run and measured.

All of the above are algorithmically frozen as of the Architecture
Checkpoint (the System Integration Layer, M6, and the verification
milestone are orchestration/consumption/verification around that
frozen core, not an addition to it): no further algorithm changes are
expected except a correctness defect discovery, which would itself
require an explicit review before any fix.

## Remaining subsystems

| Milestone | Objective | Depends on |
|---|---|---|
| Master Plan M7 | WebSocket streaming (Redis pub/sub, versioned envelope) | M6 |
| M8 (partial - WS client only) | Frontend shell and state management are done (this session's M8); the WebSocket client itself still depends on Master Plan M7, which isn't built yet | M6, Master Plan M7 |
| Master Plan M9 | Geospatial heatmap bound directly to live risk-score state | M8 |
| M10 | Alerting (Twilio SMS on CRITICAL, human-confirm suspension workflow) | M6, Master Plan M7 |
| M11 | RAG incident intelligence (Chroma-backed retrieval, citation-or-nothing) | M6 |
| M12 | Isolation Forest anomaly overlay + YOLOv8 PPE demo | M3, M8 — **see Risk Register** |
| M13 | Auth & RBAC | M6, M8 |
| M14 | Demo scenario assembly, counterfactual panel, deployment polish | All above |

## Integration order

1. Master Plan M7 (WebSocket) → M8 (frontend shell) — in that order, since M8 depends on both M6 and Master Plan M7. Both are now unblocked: M6 and the verification milestone are complete.
2. M9, M10, M11, M12, M13 — largely parallelizable once M8 exists, each depending only on M6/Master Plan M7/M8 as noted above, not on each other.
3. M14 — last, by definition (depends on everything).

## Critical integration points

- **Context builder ↔ Scheduler boundary:** every `ContextBuilder` returns a *complete* `AgentInput` — the scheduler performs no validation of context contents itself. A context builder that cannot assemble a complete input raises (e.g. Gas Risk's builder raises `ValueError` for an unknown sensor) rather than return a partial one; the scheduler's own last-known-value/decay fallback is what actually handles that failure, not the context builder.
- **`AgentCache`/`TierState` persistence boundary:** `run_zone_tick()` takes both as explicit parameters and returns the new values in `RiskPipelineResult` — it does not persist them anywhere itself. Whether a future caller holds them in process memory (lost on restart) or an external store (Redis is provisioned but unused) remains **open**, since no repeating "tick loop" driver exists yet to need one.
- **Fusion → Justification → Persistence hand-off:** implemented exactly as planned — `_serialize_justification()` in `risk_pipeline.py` maps `RiskAssessmentJustification` field-for-field into the JSONB column, explicitly rather than via `dataclasses.asdict`, so an accidental future field addition can't silently change what gets persisted without that function being updated too.
- **REST/WebSocket boundary (M6/M7):** must expose `compound_risk_score`/`confidence`/`tier` sourced from the same `RiskAssessment` row the heatmap (M9) later reads — Technical Review's own repeatedly-stated risk is a UI that becomes "pretty but disconnected" from the actual engine output; M9's own testing requirement already names the fix (a rendered-color-is-a-pure-function-of-the-API-value test).

## Known assumptions (not to be silently changed downstream)

- Each agent's independently-configured copy of the WATCH/ELEVATED/CRITICAL thresholds (40/65/85) is intentionally duplicated, not shared — a future calibration pass must update every copy individually or explicitly decide to consolidate them (a real architectural change requiring review, not a drive-by edit).
- Permit Intelligence's "connecting corridor" is approximated by the adjacent zone's own Gas Risk score, read from that neighbor's most recently *persisted* `RiskAssessment` (one tick of lag) rather than a same-tick computation — the System Integration Layer's approved resolution to the cross-zone dependency the frozen single-zone scheduler can't otherwise express.
- `EquipmentRecord` carries no staleness timestamp (the schema doesn't have one) — Equipment Status assumes every record it receives is the caller's current, authoritative snapshot. A context builder that queries stale equipment data will silently look authoritative to this agent.
- Gas Risk's context builder (and Counterfactual's reading assembly) assume at most one monitored gas type per zone — matching today's seed data and `SensorRepository.get_by_zone_and_gas`'s own long-standing assumption. A zone with multiple gas sensors is out of scope until a future milestone decides how Gas Risk's single-stream `AgentInput.context` shape should combine them.

## Known deferred work

- The DB-backed golden-scenario + counterfactual integration test (Master Plan M5 task 6) — still deferred: it needs a full scenario replay through `risk_pipeline.py`, not just the per-tick fixtures this milestone's own test suite uses.
- Redis and Chroma are provisioned in `docker-compose.yml` (M0) but consumed by nothing built so far — first real consumers are M7 (Redis pub/sub) and M11 (Chroma retrieval).

## Known calibration parameters

Every "proposed, not cited" constant currently in force, in one place, for a single future calibration pass to review together rather than hunting through each module's docstring individually:

| Module | Parameter | Default | Basis |
|---|---|---|---|
| Gas Risk | `decay_lambda` | `ln(2)/15` | Proposed (15-min half-life assumption) |
| Gas Risk | `missing_data_confidence` | `0.1` | Proposed (shared floor value reused elsewhere) |
| Gas Risk | `uncalibrated_confidence_floor` | `0.3` | Proposed |
| Gas Risk | `insufficient_history_confidence_floor` | `0.5` | Proposed |
| Gas Risk | `min_readings_for_regression` | `3` | Proposed |
| Gas Risk | `calibration_stale_days` | `30` | Proposed |
| Worker Exposure | `watch_weight`/`elevated_weight`/`critical_weight` | `1`/`2`/`4` | Proposed (increasing schedule) |
| Worker Exposure | `fail_safe_assumed_headcount` | `1` | Proposed (safety default, not an estimate) |
| Permit Intelligence | `risk_delta_threshold` | `20.0` | Proposed |
| Permit Intelligence | `risk_by_status` | `{active:0, flagged:65, suspend_recommended:90}` | Proposed (partially derived from cited ELEVATED value) |
| Fusion | `agent_weights` | `0.4/0.3/0.2/0.1` | Proposed (ordering matches documented priority) |
| Fusion | `interaction_bonus_kappa` | `0.4` | Proposed (midpoint of cited 0.35–0.5 range) |
| Tiering | `dwell_ticks` | `2` | Cited as an example ("e.g. 2"), not an exact mandated value |
| Scheduler | `staleness_decay_lambda` | `ln(2)/5` | Proposed (direction — "accelerated relative to Gas Risk's own decay" — is cited; the exact number is not) |

Cited (not proposed) values used identically wherever they appear:
`elevated_floor`/`watch_threshold` = 40.0, `elevated_threshold` = 65.0,
`critical_threshold` = 85.0 (Technical Review §5.6), `de_escalation_margin` = 10.0 (Technical Review, explicit).

## Known infrastructure dependencies

- **TimescaleDB/PostgreSQL** (`timescale/timescaledb:latest-pg16`) — in use since M1.
- **Redis 7** — provisioned, not yet consumed. First real consumer: M7 (WebSocket pub/sub fan-out); a candidate store for `AgentCache`/`TierState` persistence if the in-process-memory option is rejected during Context Builder design.
- **ChromaDB** — provisioned, not yet consumed. First real consumer: M11 (RAG retrieval).
- **Alembic** — in use since M1 for schema migrations; no pending migration required by anything in this freeze.

## Verification results (End-to-End Integration Verification milestone)

What was actually executed in this sandbox, and what its result was:

- **Full validation suite** — `ruff`, `black --check`, `mypy` (strict), and the complete `pytest` run all green; the DB-dependent integration tests fail only with a connection error (37 of them, up from 29 before M6 — exactly the count of new DB-backed tests M6 added, no new failure type).
- **Static infrastructure review** — `docker-compose.yml`'s three services (db/redis/chroma) and the backend all have real healthchecks and `depends_on: condition: service_healthy` (not just start-order); the backend's `DATABASE_URL` correctly overrides to the Compose service hostname `db` rather than `localhost`. Both migrations (`0001`, `0002`) reviewed end to end: hypertables and their two `sensor_readings` indexes match the model docstrings exactly; `0002`'s additive constraint widening is correctly isolated from `0001`. `seed.py`'s idempotency (deterministic ids + `merge()`-based `create()`) re-confirmed by reading, not by running.
- **Determinism, verified empirically, not just asserted** — the same synthetic zone-tick run twice through the real `scheduler.run_tick()` → `fuse()` → `transition()` → `build_risk_assessment_justification()` chain (in-memory `ContextBuilder`s, no database) produced byte-identical `FusionResult` values, tier, and `RiskAssessmentJustification` — including nested floating-point agent contributions and `rules_fired` ordering — across two independent Python process calls.
- **Compute-only performance baseline** (`scripts/benchmark_deterministic_engine.py`, excludes all database I/O — see that script's own docstring for why): one zone/one tick ≈ 0.35–0.55 ms; ten zones (sequential) ≈ 0.29–0.32 ms/zone; one hundred ticks ≈ 0.28–0.31 ms/tick. The deterministic engine's own CPU cost is sub-millisecond per zone-tick; real-world latency in a live deployment will be dominated by Context Builder queries and the `RiskAssessment` write, not by this compute path.
- **Not executed at that time (no Docker/Postgres available)** - since resolved. See "Verification results (M9)" immediately below.

## Verification results (M9 - Full System Integration & Live Infrastructure Verification)

The first milestone in this project to run against a real PostgreSQL
16 instance (portable EnterpriseDB binaries, no Docker/admin rights
available in this sandbox - TimescaleDB itself is still unavailable,
worked around for verification purposes only via a local
`create_hypertable` SQL stub applied directly to the verification
database, never to a project migration file) and a real, running
frontend+backend pair in a browser.

- **Full pytest suite against the live database**: all 245 tests pass
  (previously 236 passed / 9 failed / 37 errored with no live
  database). The 9 failures and 37 errors both traced to one root
  cause (below), not 46 independent problems.
- **Two genuine defects found and fixed, both approved before
  implementation**:
  1. `0002_risk_assessments_normal_tier.py`'s `downgrade()` failed
     with an `IntegrityError` whenever a `'normal'`-tier row existed
     (the majority case in real operation), because it re-applied the
     old stricter CHECK constraint without removing those rows first.
     Fixed by deleting `'normal'`-tier rows before re-tightening the
     constraint, with an explanatory comment on why the downgrade is
     intentionally lossy. `upgrade()` is unchanged.
  2. `src/api/main.py` had no CORS middleware, so every browser
     request from the M8 dashboard (a different origin/port) was
     silently blocked by the browser even though the backend answered
     `200 OK` - invisible until this milestone because M8's own tests
     mocked the network boundary with MSW. Fixed with `CORSMiddleware`
     plus a new `cors_allowed_origins` setting (default
     `http://localhost:5180`), restricted to `GET` since the API is
     entirely read-only today.
- **Full scenario replay** (`scenarios/demo_vizag_clairton.yaml`)
  through the real pipeline: sensor ingestion → agents → scheduler →
  fusion → tiering (hysteresis observed correctly gating a single-tick
  95.14 spike from escalating past `dwell_ticks=2`) → justification →
  persistence → counterfactual, with every persisted row inspected
  directly in the database (UUIDs, timestamps, `compound_risk_score`,
  `confidence`, `tier`, `justification` JSONB, permit
  `baseline_snapshot`) and confirmed to match the pipeline's own
  returned values exactly.
- **REST API exercised against this populated data**: every endpoint,
  pagination (`limit`/`before`/`after`), zone/status filtering,
  ordering, and error responses (malformed UUID, out-of-range `limit`,
  invalid `status`, unmapped route) all verified against the database
  directly - no discrepancies.
- **Frontend verified against the real backend** (no mocks): Overview,
  Zone (including trend direction), Permits (including zone/status
  filtering), and Audit pages all render real, correct database-backed
  data once CORS was fixed. Two rendering behaviors could not be
  observed live in this specific automated preview browser tab because
  it reports `document.visibilityState === "hidden"`: the historical
  risk chart (Recharts' `ResponsiveContainer` needs a real layout pass)
  and React Query's error-state transition on a real network failure
  (`focusManager.isFocused()` - by TanStack Query's own design - pauses
  a query's retry sequence on a backgrounded tab, so `status` never
  reaches `"error"`). Both are pre-existing, correct, already-tested
  behaviors (the latter is directly covered by
  `OverviewPage.test.tsx`'s "shows the backend's error envelope"
  test, which passes because jsdom reports the tab as visible) - not
  application defects, and not fixed here.
- **Determinism replay**: the same scenario run through three
  independent, freshly-created databases produced byte-identical
  script output, byte-identical persisted `risk_assessments` rows, and
  byte-identical `GET /risk/current` REST responses across all three.
- **Real latency measurements** (this sandbox's local Postgres, not a
  deployment target - measurements only, no optimization performed):
  single-zone pipeline tick (agents through persistence and
  counterfactual) median 14.5 ms (mean skewed to 24.6ms by one 212ms
  cold-start outlier); two-zone sequential tick median 27.5 ms. REST
  server-side processing time (`time_starttransfer` minus
  `time_connect`, since raw `curl` wall time in this sandbox's
  networking stack carries a ~200ms fixed connection overhead present
  even on the static `/health` endpoint): `/health` ~2ms,
  `/risk/current` ~5.5ms, `/permits` ~7.7ms,
  `/risk/history/{zone}?limit=50` ~11.4ms, `/audit` ~29ms (first hit;
  not re-measured after warm-up).

## Risk register for remaining milestones

| Risk | Affected milestone(s) | Severity | Notes |
|---|---|---|---|
| **M12's assumed Gas Risk "`anomaly_score` extension point" does not exist.** The Master Plan describes M12 as wiring an Isolation Forest's output into an extension point "left open since M3" — no such hook exists anywhere in the frozen `gas_risk.py`. | M12 | High for M12 specifically, none for the frozen engine | M12 will need either (a) an approved, additive extension to `GasRiskConfig`/`calculate_risk` (a genuine change to a frozen interface, requiring Architecture Review at that time), or (b) a redesign of M12 to combine the anomaly score at the Fusion or persistence layer instead of inside Gas Risk itself. Flagging now so M12 planning doesn't assume a hook that was never built. |
| **`AgentCache`/`TierState` persistence store remains undecided.** | M6/M7 (whatever builds the tick-loop driver) | Medium | `run_zone_tick()` takes and returns both explicitly rather than deciding where they live — the *decision* of where a repeating caller stores them (in-process singleton vs. Redis-backed) is still open, deferred to whoever builds the first real tick-loop driver. |
| **Duplicated threshold constants (40/65/85) across five independently-configured modules.** | Any future calibration pass | Low | Intentional by design (documented in `docs/architecture/agent_pattern.md`), but a real-world tuning pass must remember to update every copy — there is no single source of truth to edit once. |
| **Redis/Chroma provisioned but unexercised.** | M7, M11 | Low | No integration risk yet since nothing depends on them working correctly today; flagged only so M7/M11 don't assume they've already been validated against this codebase. |
| **Gas Risk/Counterfactual assume at most one gas sensor per zone.** | Any future multi-sensor zone | Low | Matches today's seed data exactly; a zone with two monitored gas types would need a policy decision (worst-of, or multiple Gas Risk invocations reconciled before Fusion) this milestone deliberately left out of scope. |
| **No index on `risk_assessments(zone_id, timestamp)`.** Found during the verification milestone's static migration review: `sensor_readings` got two supporting indexes at M1, `risk_assessments` got none, even though M6's `latest_by_zone`/`latest_for_all_zones`/`history_by_zone` all filter and sort by exactly that pair. | M6's read endpoints, any future load testing | Low at demo scale, real at production scale | Not fixed here — a schema change is out of this verification-only milestone's scope ("this is not optimization"). A future additive migration should add it before real load testing. |
| **Docker still unavailable in this development sandbox; resolved for PostgreSQL specifically.** Resolved at M9 via a portable, no-installer PostgreSQL 16 binary (no admin rights required) — all 245 tests now pass against a real database. Docker itself (and therefore the project's actual `timescale/timescaledb` image) remains unavailable; TimescaleDB hypertable behavior was worked around at M9 with a verification-database-only SQL stub for `create_hypertable`, never applied to any project file. | Real hypertable/chunking behavior specifically | Low — every other code path (schema, constraints, repositories, pipeline, API) has now been verified against a real Postgres | Running the full stack against the actual `docker-compose.yml` (real TimescaleDB image, real Redis/Chroma) before a production deployment is still recommended and has never yet been done in this environment. |
| **Two genuine defects found and fixed at M9** — see "Verification results (M9)" above for full root-cause detail. `0002_risk_assessments_normal_tier.py`'s `downgrade()` failed on any database containing a `'normal'`-tier row (fixed: deletes those rows before re-tightening the constraint). `src/api/main.py` had no CORS configuration, silently blocking every browser request from the M8 dashboard (fixed: `CORSMiddleware` + new `cors_allowed_origins` setting). | M9 (both already fixed and re-verified) | Resolved | Both were invisible before M9 because no prior milestone had a live database or a live browser+backend pair running simultaneously. Neither touched a frozen module. |
| **Two live-preview-tool-only rendering limitations, not application defects.** In the specific automated browser tab this project's preview tooling controls, `document.visibilityState` reports `"hidden"`, which (by TanStack Query's and Recharts' own designed behavior, not a code defect here) prevents observing the historical risk chart's live pixel output and the error-state UI transition on a real network failure. | Manual QA / demo rehearsal | Low | Both behaviors are already covered by `OverviewPage.test.tsx`'s existing MSW-based tests, which pass because jsdom reports the tab as visible. A real end-user's foregrounded browser tab does not have this limitation. |
