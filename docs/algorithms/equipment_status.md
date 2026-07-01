# Equipment Status Agent

Source: Technical Review §4.4 (agent spec), Domain Research Report
Part 2 (the common-cause independence requirement). Describes the
methodology; does not restate the code.

## Degradation rule

A piece of equipment counts as a currently-degraded protection layer
if its isolation status is `"isolated"` or `"degraded"`, or if its
maintenance flag or LOTO-confirmed flag is set — anything other than
fully active and untouched is treated as not currently providing its
protective function, whether the reason is a fault or a deliberate,
safe lockout. No boolean formula is given verbatim in the source
documents; this is the implementation's interpretation of the three
qualitative inputs §4.4 names ("maintenance flags, LOTO status, valve
isolation state").

## Common-cause heuristic

Domain Research Report Part 2 requires that "independent" protection
layers actually be independent: two layers failing for a *shared*
reason (its own example: two layers sharing a power bus) is one
failure, not two. The schema has no dedicated common-cause attribute
to check directly, so this implementation uses **equipment type** as
a proxy: degraded records of the same `equipment_type` collapse into
one group. This is explicitly a conservative **heuristic
approximation**, not a full common-cause analysis — it will
under-count truly independent failures that happen to share a type,
and over-count nothing, which is the safer direction to be wrong in
for a system that must never manufacture false confidence.

## Count-to-risk mapping

No formula is given anywhere for converting a degradation count into
a 0–100 risk contribution (unlike Gas Risk, which has an explicit
one). This implementation reuses Gas Risk's saturating mathematical
*family* — `risk = 100 × (1 − e^(−k × ratio))` — applied to the ratio
of degraded equipment-type groups to total distinct equipment types
present, so both agents' outputs remain comparable on the same 0–100
scale for the Orchestrator's future interaction-bonus term (M5).
`k` is derived the same way as Gas Risk's (`risk ≈ 50` at
`ratio = 0.5`, giving `k = 2·ln(2)`), but is its own independent
configuration value — not shared or imported from `gas_risk.py`.

## Confidence

No formula is given for this agent (unlike Gas Risk's explicit
basis). Two cases are distinguished deliberately: a caller that never
supplied equipment data at all leaves genuinely no information (low,
configurable confidence floor); a caller that explicitly reports zero
equipment is a confirmed, complete fact, not an information gap (full
confidence). Any non-empty, present inventory is likewise treated as
the caller's authoritative current picture (full confidence) — there
is no per-record staleness signal to degrade against, since the
underlying schema carries no timestamp column for equipment records
(a real gap, noted in `docs/roadmap.md`-adjacent terms in the code's
own docstrings, not fixed here).

## Degraded-data philosophy — a deliberate contrast with Gas Risk

Gas Risk fabricates a conservative *elevated* number when sensor data
goes missing, because absence of sensor data is itself risk-relevant.
Equipment Status does the opposite: missing equipment data produces
an **honest zero** with **low confidence**, never a fabricated
degradation count — Technical Review §4.4 states this explicitly as
"a different failure mode than the sensor case." A genuinely invalid
input (an unrecognized isolation status) still raises rather than
being silently absorbed, the same as every other agent in this
project.

## No prediction

Unlike Gas Risk's regression-based time-to-threshold, this agent
performs no forecasting. Nothing in the source documents describes a
"time until the next layer degrades" concept, and no downstream
consumer is described as needing one — the Orchestrator's interaction
bonus only needs the current count.
