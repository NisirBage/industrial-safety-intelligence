# Technical Highlights

Notable engineering choices worth calling out to a technically literate
audience.

## Frozen-engine discipline, enforced not just documented

The deterministic core (`src/domain/`) has been frozen since before
this UI-focused milestone began, and every rule around that freeze is
mechanically enforced, not just written down:

- An AST-walking test statically scans `src/domain` and `src/services`
  for `datetime.now()`/`time.time()` calls and fails the build if it
  finds one.
- A permanent structural test asserts the Counterfactual Comparator
  never imports or calls any compound-engine module.
- Every frozen file's byte-identity to its original milestone commit
  was independently git-diff-verified during a release audit.
- This entire multi-milestone UI build (10+ ordered sub-items) touched
  zero files under `src/domain/` - confirmed via `git diff HEAD --
  src/domain/` returning empty at every checkpoint.

## The interaction bonus is the whole thesis, made visible

`R_compound = min(100, R_base * (1 + k * max(0, n-1)))` - a
multiplicative bonus when more than one agent is contributing
meaningful risk simultaneously. The `scenario_simops_conflict.yaml`
scenario was authored specifically to make this concrete: a gradual
gas rise plus a concurrent hot-work permit produces a compound score
of 99.9 (CRITICAL) while the naive single-sensor threshold system
never crosses its trip point (highest ratio 0.90, stays CLEAR). That
gap is rendered directly on `/comparison`, not asserted in a slide.

## Explainability at three depths, same underlying data

- **Explainability page**: consumer-friendly - tier, score, agent
  contribution chart, recommended actions.
- **Research Mode**: every pipeline stage (Sensors -> Context Builders
  -> 4 agents -> Fusion -> Tiering -> Explainability ->
  Recommendations) as a clickable diagram, plus the raw persisted
  JSON.
- **Decision Journal**: the same breakdown, but for every persisted
  assessment across every zone, searchable and filterable.

All three read the exact same `RiskAssessment.justification` JSONB
column - no separate "explanation service," no divergence risk between
what different views of the same decision say.

## A recommendation engine that is a lookup table, not a model

`deriveRecommendations(tier, justification)` maps a tier and a set of
already-fired rule identifiers to canned action text. It is
deliberately incapable of hallucinating a recommendation that doesn't
trace to something the frozen engine already decided.

## Determinism verified end to end, including through the UI

The same seeded plant + the same three scenario YAMLs replayed through
the real Risk Pipeline produce byte-identical persisted rows every
time (verified via repeated replay + diff during earlier milestones).
The frontend then renders whatever those rows say - there is no
client-side recomputation of risk anywhere in the React codebase.

## Presentation-layer additions never touch the compound score

Every new page this milestone added (plant map, live playback,
decision journal, pipeline diagram, executive KPIs, decision
comparison, demo mode) is provably read-only: it either displays an
existing `RiskAssessment` row, groups/filters/searches a list of them,
or calls the independent Counterfactual Comparator on demand. None of
it feeds back into persistence, and none of it recomputes a risk
value the backend didn't already compute.

## Test discipline held throughout

261 backend tests (pytest, live PostgreSQL) and 56 frontend unit tests
for the pure-logic helpers introduced across this milestone series -
all passing, `ruff`/`black`/`mypy --strict` clean on the backend,
`oxlint`/`tsc`/`vite build` clean on the frontend, verified fresh
immediately before this report.
