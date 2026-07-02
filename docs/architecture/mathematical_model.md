# Mathematical foundations

Documentation only — the conceptual and mathematical relationships
across all five deterministic models, not their code. See
`docs/algorithms/*.md` for each model's full derivation and
implementation-level detail.

## Gas Risk model

A saturating exponential maps a physical reading's proximity to its
alarm threshold onto the common 0–100 scale: `100 × (1 − e^(−k·x))`,
where `x` is `reading / threshold`. Staleness decays the result
toward a conservative floor — never toward zero — so an unreachable
sensor cannot look safe. Confidence is the minimum of three
independent factors (freshness, calibration recency, history
sufficiency), and a linear regression over the recent window projects
a time-to-threshold when enough data exists to trust a trend at all.

## Equipment Status model

The same saturating family, but its input is a *ratio* rather than a
*reading*: the fraction of distinct equipment types currently
degraded, after a common-cause heuristic collapses multiple degraded
items of the same type into one group (two failed valves aren't two
independent protection-layer losses if they share a cause). Missing
inventory data produces an honest zero, never a fabricated
degradation — the opposite failure direction from Gas Risk's, because
absence of an equipment report is not itself evidence of a fault the
way a silent sensor is evidence of risk.

## Worker Exposure model

Headcount weighted by a tier derived from the *upstream* Gas Risk
score — since compound tiering doesn't exist until this same
computation is fused across agents, Worker Exposure uses its own
independent copy of the WATCH/ELEVATED/CRITICAL thresholds to weight
a zone's own risk level before headcount even enters the formula. The
weighted exposure feeds the same saturating shape a third time. A
missing location feed is treated as a *safety default* — a minimum
assumed headcount, never zero — distinct from a genuinely confirmed,
empty zone.

## Permit Intelligence policy model

Categorical, not continuous: two independent findings (a live-vs-
baseline risk delta exceeding a threshold, and a SIMOPS adjacency
conflict) each map to a severity level, and the permit's recommended
status is the *most severe* of its previous status and this tick's
findings — escalation-only, never automatic de-escalation. The
resulting status is itself mapped onto the common 0–100 scale via
policy configuration, so a categorical decision remains comparable to
the three continuous agents' outputs at fusion time.

## Fusion model

A weighted sum of all four agents' 0–100 scores, `Σ(w_i · r_i)` with
weights summing to 1, multiplied by an interaction bonus that grows
with how many agents are simultaneously elevated:
`1 + κ · max(0, n−1)`, capped so the compound score never exceeds 100.
This is the mathematical expression of the project's central claim —
that risk compounds rather than merely adds when independent
protection layers weaken together — and it is the only place in the
system where all four agents' outputs are combined into one number.

## Confidence aggregation philosophy

One rule, applied identically at every level from a single agent's
internal factors up through Fusion's cross-agent combination: take
the **minimum**, never the average. A single uncertain input — one
uncalibrated sensor, one agent that failed to report and is being
represented by a decayed last-known value — must be able to pull the
entire compound confidence down, because averaging would let three
confident agents mask one agent that has no real basis for its
number. This is the one mathematical idea repeated, without
exception, across all five models above.
