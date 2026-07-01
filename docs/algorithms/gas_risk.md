# Gas Risk Agent

Documentation-only backfill (M3C) for the agent implemented in M3B
(`src/domain/agents/gas_risk.py`). Describes the methodology and
where each constant comes from; does not restate the code.

Source: Technical Review §4.1 (agent spec), §5.1 (risk normalization),
§5.4 (staleness decay), §5.5 (confidence).

## Risk score

A saturating function of how close the current reading is to the
sensor's alarm threshold:

```
risk = 100 × (1 − e^(−k × (value / alarm_threshold)))
```

`k` (`GasRiskConfig.steepness_k`) is **derived**, not arbitrary: the
spec requires `risk ≈ 50` at "elevated but not yet alarming," read as
half the alarm threshold. Solving `50 = 100×(1−e^(−k×0.5))` gives
`k = 2·ln(2) ≈ 1.386`. One consequence worth knowing: because the
curve is saturating, risk at the alarm threshold itself is `75`, not
`100` — it only approaches 100 asymptotically as the reading rises
further past the threshold.

## Staleness decay

The spec's own formula (§5.4) is written as decay toward zero, which
contradicts the sentence right after it stating the intent is decay
toward the **elevated floor**, not zero — a silent sensor must never
look safe. The implementation uses the form that actually satisfies
that intent:

```
risk = elevated_floor + (raw_risk − elevated_floor) × e^(−λ × minutes_since_last_reading)
```

At zero staleness this equals the fresh `raw_risk` exactly; as
staleness grows it asymptotes to `elevated_floor`, never below it.
`λ` (`GasRiskConfig.decay_lambda`) has no value specified anywhere in
the source documents — the default halves the reading's distance
above the floor roughly every 15 minutes, a reasonable placeholder
pending real sensor cadence data, not a cited figure.

`elevated_floor` itself defaults to `40.0`, the one concrete number
the source documents give (§5.3's own interaction-bonus example: *"n
= number of agents currently reporting r_i ≥ elevated_floor (e.g.,
40)"*) — used here as the fail-safe floor value.

## Time to threshold

Ordinary least-squares linear regression over the rolling reading
window, extrapolated to the alarm threshold. Requires at least 3
readings — fewer than that, the trend is reported as unavailable
rather than extrapolated from insufficient data. A flat or falling
trend also reports "unavailable," since it never reaches the
threshold.

## Confidence

Minimum (not average) of three independent sub-scores: reading
freshness (same `λ` as the risk decay), sensor calibration recency
(a hard cutoff at 30 days), and whether enough readings exist for the
regression to be trustworthy. Using the minimum means one bad factor
can't be masked by two good ones — deliberately conservative,
matching the project's fail-safe philosophy throughout.

## Degraded-data behavior

Three cases, each independently distinguishable in `rules_fired`:
missing data (zero readings — reports the elevated floor directly),
stale data (latest reading older than 15 minutes — the continuous
decay above, labeled for visibility), and insufficient history (fewer
than 3 readings — risk is still computed from the latest value, but
`time_to_threshold` is withheld). A missing `alarm_threshold` in the
input context is treated differently again: that's a caller
integration bug, not sensor degradation, and raises rather than
degrading gracefully.
