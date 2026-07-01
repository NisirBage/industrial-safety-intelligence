# Worker Exposure Agent

Source: Technical Review §4.3 (agent spec), §5.6 (tier thresholds,
reused here independently). First document using the standardized
algorithm template (M3D); `gas_risk.md` and `equipment_status.md`
predate it and are not retroactively reformatted.

## Purpose

Weight zone headcount by the upstream Gas Risk Agent's score to
produce an exposure risk contribution, and flag workers present in an
at-risk zone with no active permit covering it (Technical Review
§4.3's "unauthorized presence flag").

## Inputs

- `AgentInput.upstream_results["gas_risk"]` — the Tier-0 Gas Risk
  Agent's already-published `AgentResult`. This agent never
  instantiates or calls `GasRiskAgent` directly; it only reads the
  result the scheduler already computed (M3A's tier-agnostic
  mechanism, used here for the first time by any agent).
- `AgentInput.context["workers_present"]` — a list of `WorkerPresence`
  (identifier, role), assumed pre-filtered to this zone by the caller.
- `AgentInput.context["permit_coverage"]` — a `PermitCoverage` fact
  (currently just `has_active_permit`), optional; absent means "not
  covered," never "assume covered."

## Assumptions

- PPE assessment is explicitly out of scope — that's a separate,
  computer-vision-based capability (M12), not part of this agent.
- Occupancy is zone-level only; nothing in the source documents
  describes sub-zone proximity or distance-weighted exposure.
- Permit coverage is zone-level (does *a* permit cover this zone),
  not per-worker (the permit doesn't name specific workers).
- `PermitCoverage` is a small, deliberately extensible fact type, not
  the eventual Permit Intelligence `AgentResult` — M4 doesn't exist
  yet, and this type doesn't guess at its shape.

## Configuration

All values are independent — not shared or imported from Gas Risk,
Equipment Status, or (once it exists) the Orchestrator's own tiering
module, per this project's standing "no shared/imported constants
between agents" discipline.

| Parameter | Default | Basis |
|---|---|---|
| `steepness_k` | `2·ln(2) ≈ 1.386` | Derived: `risk ≈ 50` at half the saturation point, same reasoning as Gas Risk/Equipment Status |
| `watch_threshold` / `elevated_threshold` / `critical_threshold` | `40` / `65` / `85` | Cited: Technical Review §5.6 |
| `below_watch_weight` | `0.0` | Cited reasoning: §4.3 states this agent is "only actionable once gas/permit risk is already elevated" |
| `watch_weight` / `elevated_weight` / `critical_weight` | `1.0` / `2.0` / `4.0` | Proposed, not cited — no numeric weight schedule appears anywhere in the source documents |
| `fail_safe_assumed_headcount` | `1` | A safety default, not an occupancy estimate — proposed, not cited |
| `missing_context_confidence` | `0.1` | Same floor value used by the other two agents |

## Mathematical Model

```
tier_weight = below_watch_weight                         if gas_risk_score < watch_threshold
            = watch_weight                                if watch_threshold <= gas_risk_score < elevated_threshold
            = elevated_weight                              if elevated_threshold <= gas_risk_score < critical_threshold
            = critical_weight                              if gas_risk_score >= critical_threshold

weighted_exposure = headcount × tier_weight

risk = 100 × (1 − e^(−steepness_k × weighted_exposure))
```

Same saturating family as Gas Risk and Equipment Status, applied to a
tier-weighted headcount rather than a physical ratio — there is no
natural "threshold" concept for a person count the way there is for a
gas reading, so the raw weighted exposure value is used directly as
the saturating function's input.

## Confidence Model

Binary, not continuous: `1.0` when the location feed is present
(regardless of headcount — a confirmed, even empty, list is a
definitive fact), `missing_context_confidence` when it's absent
entirely. No per-reading freshness or redundancy factor applies here,
since worker position is described as "current-position only, no
history required" (§4.3) — there's no time-series to evaluate
staleness against, unlike Gas Risk's sensor readings.

## Explainability

`Justification.evidence` includes `headcount`, `gas_risk_score` (the
actual upstream value used), `tier_weight` (the effective weight
applied), `zone_has_active_permit`, and `unauthorized_workers` (a list
of `{identifier, role}` — Technical Review §4.3's named output,
extended with role per M3D clarification 5).

## Failure Behaviour

Three distinct philosophies now exist across the three Tier-0 agents,
each justified independently rather than copied from the last:

- **Gas Risk**: missing sensor data → fabricate a conservative
  *elevated risk number* (absence of data is itself risk-relevant).
- **Equipment Status**: missing equipment data → an *honest zero*
  count with low confidence (never fabricate degradation that wasn't
  logged).
- **Worker Exposure**: missing location data → assume a conservative
  *non-zero headcount floor* (`fail_safe_assumed_headcount`), never
  zero — Technical Review §4.3's own words: *"never 'assume empty.'"*

A missing upstream Gas Risk result (as opposed to missing *location*
data) is treated differently again: that's a scheduler/orchestration
bug — Tier-0 must run before this agent — not domain uncertainty, and
it raises rather than silently defaulting to a falsely safe score.

## Examples

- 2 workers present, Gas Risk at 70 (ELEVATED, weight 2.0): weighted
  exposure = 4.0, `risk = 100×(1−e^(−1.386×4)) ≈ 99.7`.
- 1 worker, Gas Risk at 20 (below WATCH, weight 0.0): `risk = 0.0`
  regardless of headcount.
- Location feed missing, Gas Risk at 70: headcount assumed = 1
  (the safety floor), `risk = 100×(1−e^(−1.386×2)) = 93.75`,
  confidence = 0.1.

## Known Limitations

- Tier weights (1.0/2.0/4.0) are proposed, not cited from any source
  document — a candidate for revision once real incident data or
  domain-expert input is available.
- No per-worker permit authorization exists in the current model —
  coverage is zone-wide, matching what the source documents describe,
  but a real system might eventually need permit-to-worker
  specificity.
- `PermitCoverage` will need to evolve once M4 (Permit Intelligence)
  actually exists and its real output shape is known; this is
  deliberate forward-compatibility, not a gap to fix now.
