"""Operational Foresight & Predictive Intelligence (M25).

Turns Historical Intelligence (`src/historical/`) from "what happened
before" into "given similar historical trajectories, what is most
likely to happen next" - entirely by looking up and aggregating REAL
historical continuations of matched trajectories, never by fitting a
new predictive model.

Hard architectural boundary, enforced by convention here the same way
`src/historical/` enforces it: this package has **no dependency on
`src/domain/`**. It never computes a risk score, never assigns a tier,
never fuses agent contributions, never runs the scheduler or the
simulation engine, and never produces a "recommendation" of its own -
`frontend/src/lib/recommendations.ts`'s deterministic derivation over
the real engine's justification remains the sole source of "what to
do next." Everything in this package is read-only evidence framing:
a forecast point cites the matched historical incidents it was
aggregated from, a confidence score is a transparent function of how
much historical data actually agreed, and every visual and sentence
this package's data eventually reaches must be labeled as a
projection, never rendered or worded as if it were a persisted,
authoritative `RiskAssessment` row.
"""
