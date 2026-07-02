# Permit Intelligence Agent

Source: Technical Review §4.2 (agent spec), §5.6 (tier thresholds,
reused independently), Domain Research Report Part 2 (SIMOPS/IPL
independence). Uses the standardized template; documents the complete
algorithm now that M4B has built it on top of M4A's representations.

## Purpose

Validate open permits against live zone risk and SIMOPS zone
adjacency, recommending status escalations only — never persisting a
change itself (reasoning stays separate from persistence throughout).

## Inputs

- `AgentInput.upstream_results["gas_risk"]` — this zone's live Gas
  Risk `AgentResult` (both `.risk` and `.confidence` are used).
- `AgentInput.context["permits"]` — open `PermitRecord`s in this zone
  (M4A representation); permits with `status == "closed"` are
  excluded from evaluation entirely.
- `AgentInput.context["permit_feed_stale"]` — drives the fail-open-
  never rule.
- `AgentInput.context["adjacent_zones"]` — `AdjacentZoneStatus` list
  for SIMOPS (M4A representation); `None` (key absent) is distinct
  from `[]` (confirmed no neighbors) — see Confidence Model.

## Assumptions

- Permit status uses the frozen schema's lowercase vocabulary
  (`active`/`flagged`/`suspend_recommended`/`closed`), not the source
  documents' uppercase `VALID`/`FLAGGED`/`SUSPEND_RECOMMENDED` prose —
  reconciled during M1, continued here (M4A clarification 2).
- SIMOPS's "connecting corridor" (§4.2) has no dedicated entity in the
  approved schema; the adjacent zone's own Gas Risk score is used as
  the best available proxy (M4A clarification 5).
- Permit recommendations are escalation-only: this agent never
  recommends a status less severe than the permit's current one.
  De-escalation requires an explicit supervisory action outside this
  agent's scope entirely — no such mechanism exists here or is
  planned for this agent.
- A zone may have multiple open permits; the agent reports its most
  severe individual permit's risk contribution as `AgentResult.risk`.

## Configuration

All values independent of every other agent's configuration.

| Parameter | Default | Basis |
|---|---|---|
| `risk_delta_threshold` | `20.0` | Proposed, not cited |
| `incompatible_permit_pairs` | `{{hot_work, confined_space}}` | Cited: Technical Review §4.2's own example |
| `adjacent_zone_elevated_threshold` | `65.0` | Cited: Technical Review §5.6 (ELEVATED) |
| `status_severity_order` | `(active, flagged, suspend_recommended)` | Structural — the state machine's ordinal ranking |
| `severity_on_baseline_breach` | `flagged` | Proposed, not cited |
| `severity_on_simops_conflict` | `suspend_recommended` | Proposed — SIMOPS framed as more structurally serious than a baseline drift |
| `severity_on_stale_feed` | `flagged` | Proposed — matches §4.2's fail-open-never wording |
| `risk_by_status` | `{active: 0, flagged: 65, suspend_recommended: 90}` | Proposed; `flagged` reuses the cited ELEVATED value, `suspend_recommended` placed above the cited CRITICAL threshold (85) as this agent's most severe finding |
| `missing_adjacent_data_confidence` | `0.1` | Same floor value used by every other agent |
| `algorithm_version` / `policy_version` | `1` / `1` | Distinct: the mechanism's version vs. the threshold/mapping values' version (M4B clarification 9) |

## Mathematical Model

Two independent checks, each producing a typed finding (M4A):

```
baseline_assessment = assess_baseline_delta(permit.baseline, live_gas_risk, config)
  exceeded = (live_gas_risk - baseline.gas_risk_at_issuance) > risk_delta_threshold

simops_conflicts = detect_simops_conflicts(permit.permit_type, adjacent_zones, config)
  conflict if: adjacent.gas_risk_score >= adjacent_zone_elevated_threshold
           and {permit.permit_type, adjacent_permit_type} in incompatible_permit_pairs
```

Combined into a recommendation, escalation-only:

```
candidates = [previous_status]
if feed_stale:
    candidates.append(severity_on_stale_feed)
else:
    if baseline_assessment.exceeded: candidates.append(severity_on_baseline_breach)
    if simops_conflicts:             candidates.append(severity_on_simops_conflict)

recommended_status = most severe of candidates, per status_severity_order
risk = risk_by_status[recommended_status]
```

Because `previous_status` is always a candidate, the result can never
be less severe than what was already recorded — this is the entire
mechanism behind "escalation-only," not a separate check bolted on
afterward.

## Confidence Model

`min(gas_risk_confidence, adjacent_data_confidence)` — the first
agent in this project whose confidence depends on *another agent's*
confidence, not just its own risk computation. `adjacent_data_confidence`
is `1.0` when `adjacent_zones` was actually supplied (even an empty
list — a confirmed, neighbor-less zone is a complete fact, the same
missing-vs-confirmed-empty distinction Equipment Status and Worker
Exposure each established independently) and `missing_adjacent_data_confidence`
when the key is absent entirely.

## Explainability

`Justification.evidence` includes `algorithm_version` *and*
`policy_version` separately (M4B clarification 9 — a policy value
change and a mechanism change are different kinds of revision), plus
one entry per permit's `PermitDecision`: previous/recommended status,
the raw baseline delta, the SIMOPS conflict count, and a human-
readable `reason` string.

## Failure Behaviour

- **Missing upstream Gas Risk result** → raises (a Tier-0 result
  absent here is a scheduler bug, the same rule Worker Exposure
  established — never silently defaults to a falsely safe score).
- **Stale/missing permit feed** → fail-open-never: every open permit
  escalates to at least `severity_on_stale_feed`, explicitly never
  assumed `active` (Technical Review §4.2's own words: "never fail
  open on a safety gate"). This is the completion criterion the
  Master Plan names explicitly for this milestone.
- **Missing adjacent-zone data** → SIMOPS reports no conflicts (never
  fabricated) but confidence drops.
- **Unrecognized permit status** → not separately validated here;
  `PermitStatus` is a `Literal` type checked at construction time by
  the type system, not a runtime branch in this module.

## Examples

- Permit active, baseline gas risk 20, live gas risk 50 (delta 30 >
  threshold 20), no SIMOPS conflicts: recommended → `flagged`,
  risk → `65.0`.
- Same permit, plus an adjacent zone at gas risk 70 also holding a
  `confined_space` permit: recommended → `suspend_recommended`
  (SIMOPS outranks a bare baseline breach), risk → `90.0`.
- Permit already `suspend_recommended`, this tick's findings clean:
  recommended stays `suspend_recommended` — escalation-only.
- Permit feed stale, permit currently `active`: recommended →
  `flagged`, `rules_fired == ["fail_open_never"]`.

## Known Limitations

- The severity mapping (baseline breach → `flagged`, SIMOPS → `suspend_recommended`)
  and every numeric threshold except the two cited ones are proposed,
  not sourced from the specification — flagged throughout as
  candidates for revision with real domain input.
- No mechanism exists (in this agent or anywhere else yet) for a
  supervisor to actually clear a `flagged`/`suspend_recommended`
  permit — that's a future API/workflow concern (M6+), not part of
  this agent's reasoning.
- `PermitRepository.update_status()` (the persistence side) is a
  separate, additive repository method; nothing yet calls it — that's
  M5/M6's `risk_pipeline.py`, not built here.
