# Counterfactual Comparator

Source: Master Plan M5 task 5 (module purpose and "never sharing
code" requirement), Master Plan test-strategy §4 (the permanent
counterfactual test), Technical Review's "naive threshold system" /
"single-sensor baseline" passages and demo timeline. Uses the
standardized template.

## Purpose

An independent, deliberately simple "naive single-threshold" baseline,
evaluated against the same raw per-sensor data the real pipeline
consumes, so the project's headline claim - "compound risk detection
accuracy versus single-sensor baselines" - is demonstrated on the same
synthetic timeline rather than merely asserted.

## Inputs

- One `CounterfactualReading` per physical sensor in a zone this tick
  (`sensor_id`, `value`, `alarm_threshold`) - the same raw quantities
  that feed Gas Risk Agent, at the earliest point in the pipeline,
  upstream of every agent.

Deliberately excludes every compound-engine output (`AgentResult`,
`FusionResult`, `TierState`, `RiskAssessmentJustification`): consuming
any of them would either require the real engine to run first, or let
a bug in the real engine's own math appear identically in the
"honest" baseline it exists to be compared against.

## Assumptions

- A zone may contain multiple independent sensors; each is judged
  against its own threshold in isolation, with no cross-referencing of
  other sensors, permits, equipment, workers, or history/trend
  (Counterfactual Comparator clarification 1).
- Missing data (no readings at all) is not itself evidence of danger
  to a naive system - it produces no alert, not a conservative one.
  This is the naive baseline's own structural blind spot, deliberately
  the opposite of Gas Risk Agent's fail-safe-toward-`elevated_floor`
  treatment of the same input.
- No formula beyond a direct threshold comparison is specified
  anywhere in the source documents, and none is invented here - the
  qualitative phrase "naive threshold system" is the complete
  specification.

## Configuration

None. Unlike every other module in this project, there is no genuine
tunable constant: `alarm_threshold` arrives as per-sensor data, not
project-wide configuration, so introducing a config dataclass here
would be an unjustified empty abstraction (Counterfactual Comparator
clarification 3).

## Mathematical Model

```
sensor_alert(reading) = reading.value >= reading.alarm_threshold
zone_alert            = any(sensor_alert(r) for r in readings)
highest_ratio         = max(r.value / r.alarm_threshold for r in readings)   # diagnostic only
```

`highest_ratio` never gates `zone_alert` - it exists purely as
explainability evidence (Counterfactual Comparator clarification 4).

**The boundary is a deliberate asymmetry, not an oversight.** At
`value / threshold == 1.0`, this comparator alerts (`>=`, a hard trip
point - how a real plant alarm actually behaves), while Gas Risk
Agent's continuous saturating curve gives only ≈75/100 risk at the
same ratio, not a binary cutoff. This difference - hard trip point vs.
continuous curve reached earlier through compounding - is
mathematically why the compound engine has lead time even when both
systems observe the identical raw threshold value.

## Confidence Model

None. The naive baseline has no notion of confidence - it is a single
binary comparison with no uncertainty modeling of any kind, which is
itself part of the contrast being demonstrated.

## Explainability

`CounterfactualResult.triggered_sensors` names every sensor that
individually crossed its own threshold (empty when `alert` is
`False`); `highest_ratio` gives the largest value/threshold ratio
observed this tick regardless of outcome, so a human can see how close
the naive system came without it having actually alerted.

## Failure Behaviour

- **Missing readings for a zone** → not a failure: `alert=False`,
  `triggered_sensors=[]`, `highest_ratio=None`. A naive system with
  nothing to compare simply stays silent.
- **Non-positive `alarm_threshold` or negative `value`** → raises
  `ValueError`. Malformed sensor data is a caller/integration bug,
  never silently tolerated (Counterfactual Comparator clarification
  6).

## Determinism

A pure function of its `CounterfactualReading` inputs only - no
wall-clock access, no internal state, no cross-tick memory of any
kind. Unlike `TierState`, there is no hysteresis or memory to model:
every tick is judged in complete isolation, which is itself the naive
baseline's defining property. Enforced by a determinism-invariant unit
test and, separately, by a permanent structural test
(`tests/unit/test_counterfactual_independence.py`) proving this module
imports nothing from the agent framework, the scheduler, Fusion,
Tiering, or Justification.

## Examples

- CO reading 30, threshold 35 (below); CH4 reading 10, threshold 10
  (at threshold): zone `alert=True`, `triggered_sensors=["ch4-1"]`,
  `highest_ratio=1.0`.
- CO reading 20, threshold 35; CH4 reading 5, threshold 10: zone
  `alert=False`, `triggered_sensors=[]`, `highest_ratio≈0.571`.
- No readings at all: `alert=False`, `triggered_sensors=[]`,
  `highest_ratio=None`.

## Known Limitations

- Evaluates only sensor readings; it has no notion of permits,
  equipment, or worker presence at all, by design - it is meant to
  represent what plant instrumentation alone would have done, nothing
  more.
- The DB-backed "golden scenario" regression test that replays the
  full authored demo scenario end-to-end and asserts zero alerts here
  while the real engine reaches CRITICAL (Master Plan M5 task 6) is
  deferred to a future milestone: it requires context builders and
  repository wiring that do not exist yet (Counterfactual Comparator
  clarification 9). This module's own unit test suite
  (`tests/unit/test_counterfactual.py`) validates its logic in
  isolation in the meantime.
- Not wired into the scheduler, any execution graph, or any
  persistence layer - it is an in-memory comparison value only; no
  table exists for it in the frozen M1 schema, and none is proposed.
