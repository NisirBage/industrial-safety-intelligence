# Architecture Walkthrough

## Layering

```
frontend/ (React + TypeScript + Vite)
        |  REST (fetch)
        v
src/api/         - FastAPI routers, Pydantic schemas, HTTP concerns only
src/services/    - orchestration/wiring ("Risk Pipeline", "Context Builders",
                   "scenario_catalog", "simulation_runner") - NOT frozen,
                   may be extended, but never duplicates domain computation
src/domain/      - the deterministic engine. FROZEN. Zero I/O.
src/infra/       - SQLAlchemy models, repositories, Alembic migrations,
                   the sole path in/out of PostgreSQL
```

Every arrow points one direction. `src/domain` never imports from
`src/services` or `src/infra`; it receives plain data in, returns
plain data out.

## The frozen deterministic engine (`src/domain/`)

- **Four independent agents** (Gas Risk, Equipment Status, Worker
  Exposure, Permit Intelligence), each a pure function: `AgentInput ->
  AgentResult`. Each has its own saturating risk curve
  (`100 x (1 - e^-kx)`), independently parameterized - never a shared
  formula call between agents.
- **Scheduler** runs agents per zone/tick, handles per-agent failure
  with a last-known-result cache - never touches a database.
- **Fusion**: `R_base = sum(w_i * r_i)`, then
  `R_compound = min(100, R_base * (1 + k * max(0, n-1)))` - the
  interaction bonus that makes SIMOPS (simultaneous, independent risk
  factors) score higher than either factor alone.
- **Tiering**: asymmetric hysteresis (a bigger drop is needed to
  de-escalate than the rise needed to escalate) plus a dwell-tick
  requirement, so the tier doesn't flap on single-tick noise.
- **Justification Builder**: reshapes the above into one frozen
  6-field record (`schema_version`, `rules_fired`,
  `agent_contributions`, `interaction_bonus_applied`, `tier_before`,
  `tier_after`) - persisted verbatim, this is what every explainability
  page in the UI reads from.
- **Counterfactual Comparator**: a deliberately separate, structurally
  isolated module - a hard trip point (`value >= alarm_threshold`) per
  sensor, `any(...)` at the zone level. No saturating curve, no
  confidence, no shared code with the compound engine. This is the
  "naive baseline" every comparison page shows.

All of the above has been frozen since before this UI work began (see
`docs/architecture/CORE_FREEZE.md`). Determinism is enforced, not
assumed: no `random.*` anywhere in `src/`, no wall-clock call in
`src/domain`/`src/services` (checked by an AST-walking test), every id
derived via a deterministic UUIDv5.

## What this milestone (Decision Intelligence + Presentation Layer) added

Two kinds of additive, read-only surface, nothing else:

1. **New REST endpoints** in `src/api/` - `GET /zones`,
   `GET /zones/{id}/workers/count`, `GET /risk/assessment/{id}`,
   `GET /counterfactual/{zoneId}`, `GET /scenarios[/​{key}]`. Each one
   either reads an already-populated table through an existing
   repository, or recomputes the frozen, independent Counterfactual
   Comparator on demand (never the compound engine - that value is
   only ever read from what was already persisted).
2. **A much larger frontend** - the plant map, live incident playback,
   decision journal, animated pipeline diagram, executive KPIs,
   decision comparison, demo mode, presentation mode - all consuming
   the endpoints above (old and new) through React Query, with a
   handful of pure TypeScript helper modules (`lib/*.ts`) doing
   display-only derivation (grouping, filtering, picking the most
   dramatic real moment to show) - never a new risk number.

## Data flow for one tick

```
Sensor reading (persisted)
   -> Context Builders (services/context_builders.py): repository
      queries only, assembles AgentInput, computes nothing
   -> 4 agents run in parallel (Scheduler)
   -> Fusion combines agent outputs -> compound_risk_score
   -> Tiering maps score -> tier (with hysteresis)
   -> Justification Builder reshapes everything into one row
   -> Risk Pipeline persists RiskAssessment(compound_risk_score, tier,
      confidence, justification JSONB)
   -> REST API serves that row, unmodified, to every frontend page
```

The Counterfactual Comparator runs as a parallel, independent branch
off the same sensor readings - never the compound score - which is
exactly what makes the two verdicts a genuine, structurally-guaranteed
comparison rather than two views of the same number.
