# Industrial Safety Intelligence Platform

An AI-assisted early-warning system for industrial plant safety. A
**deterministic Compound Risk Engine** — never an LLM or a trained
model — is the sole authority on every risk decision (score,
confidence, tier, justification). AI is scoped strictly to narrative
explanation and is never in the decision path; see
`docs/architecture/CORE_FREEZE.md` for the canonical record of what is
frozen and why.

## Status

The deterministic engine, REST API, and a full Decision Intelligence
dashboard are complete and verified end-to-end against a real
PostgreSQL database and real browser sessions (see
`docs/architecture/integration_readiness.md`'s "Verification results"
sections for exactly what was run and measured). Beyond the original
Overview/Zone/Permits/Audit views, the dashboard now includes an
interactive SVG plant map, scenario replay with synchronized
playback, an Explainability/Research Mode with a
clickable pipeline diagram, a live Counterfactual comparison against a
naive baseline, an Executive Command Center (KPIs, Plant Readiness,
Active Alerts, Action Centre), a searchable Decision Journal, a
Decision Comparison page, one-button Demo Mode, a projector-ready
Presentation Mode, a Scenario Builder that composes a new incident
from already-existing plant data and executes it through the same
unmodified pipeline (`docs/architecture/scenario_builder.md`), and a
Time Machine that replays any executed scenario tick-by-tick from
persisted data alone, with the plant map, pipeline, recommendations,
counterfactual, and decision-evolution views all synchronized to one
shared cursor (`docs/architecture/time_machine.md`), and a Decision
Graph/Root Cause Explorer that adds a per-node Evidence/Source-timestamp
inspector, a "Why did this happen?" synthesis, a naive-threshold
overlay, animated influence-path tracing, a deterministic executive
summary, and a raw-data technical view on top of the existing pipeline
diagram (`docs/architecture/decision_graph.md`), and a standalone
**Digital Twin** page (`/digital-twin`) - an animated site plan with
permit-type-specific icons, a distinct gas-sensor glyph, a drift-
animated risk heatmap, and a per-zone Inspector Drawer listing every
real sensor/worker/equipment/permit in that zone, synchronized to the
Time Machine's shared replay cursor when one is active
(`docs/architecture/digital_twin.md`), and an **Operations Center**
page (`/operations`) - a prioritized, dependency-sequenced action
queue with plant SOP references, a qualitative (never numeric)
Operational Impact Explorer, an operator incident timeline, and
embedded Digital Twin/Decision Graph snapshots, all bidirectionally
cross-linked (`docs/architecture/operations_center.md`) — see
`docs/demo/` for the full walkthrough and presentation assets. See
"Future work" below for what is deliberately not yet built.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Browser (React dashboard, M8)                               │
│  Overview · Zone · Permits · Audit — polls REST, renders      │
│  only what the API returns. No client-side risk computation.  │
└───────────────────────────┬────────────────────────────────┘
                             │ REST (JSON, read-only)
┌───────────────────────────▼────────────────────────────────┐
│  api/        FastAPI routers - validation, HTTP concerns only │
├───────────────────────────┬────────────────────────────────┤
│  services/   Orchestration only: Context Builders assemble    │
│              AgentInput from repositories; Risk Pipeline wires │
│              Scheduler → Fusion → Tiering → Justification →   │
│              persistence → Counterfactual. No computation.    │
├───────────────────────────┬────────────────────────────────┤
│  domain/     The frozen deterministic engine. Zero I/O, zero   │
│              framework imports.                                │
│              Agents: Gas Risk · Equipment Status ·             │
│                       Worker Exposure · Permit Intelligence    │
│              Orchestrator: Scheduler · Fusion · Tiering ·      │
│                       Justification · Counterfactual           │
│              Simulation: deterministic clock, curves, scenario │
│                       loader (drives the demo, not production) │
├───────────────────────────┬────────────────────────────────┤
│  infra/      SQLAlchemy models, repositories, Alembic          │
│              migrations, session management                   │
└───────────────────────────┴────────────────────────────────┘
                             │
                    PostgreSQL (TimescaleDB optional, auto-detected)
```

One-directional dependency chain, enforced by convention and by
`tests/unit/test_no_wallclock_calls.py`'s structural check:
`api → services → domain → infra`. `domain/` cannot import a database
session, an HTTP framework, or an LLM client — it is structurally
incapable of being anything but deterministic.

Full detail: `docs/architecture/pipeline.md` (execution graph),
`docs/architecture/CORE_FREEZE.md` (frozen modules/interfaces/models),
`docs/architecture/frozen_interfaces.md`, `docs/data_model.md` (schema).

## Screenshots

This repository doesn't commit static screenshot images (nothing here
fabricates a picture of a UI it can't currently capture and verify
pixel-for-pixel). Run the app locally (below) and open
`http://localhost:5173` — it takes under a minute from a fresh clone.
See `docs/demo/portfolio_screenshots.md` for the exact routes/moments
to capture if you need a static set. What you'll see:

- **Overview** — an interactive SVG plant map (tier-colored zones,
  worker-count badges, active-permit icons, equipment status, a
  gas-risk heat overlay, and a pulsing outline on any zone at
  CRITICAL), plus per-zone cards underneath.
- **Digital Twin** (`/digital-twin`) — the same site plan as a
  standalone destination, with permit-type-specific icons (flame/
  hatch/lightning/pipe), a distinct gas-sensor glyph, a drift-animated
  heatmap, and a click-through Inspector Drawer listing every real
  sensor/worker/equipment/permit in a zone. Synchronized to the Time
  Machine's shared replay cursor when a replay is active. See
  `docs/architecture/digital_twin.md`.
- **Operations Center** (`/operations`) — "what should the operator do
  right now?" A prioritized, expandable Action Queue (ETA, personnel,
  equipment, dependencies), an Operational Dependency Graph, a
  qualitative Operational Impact Explorer (CRITICAL/VERY HIGH/HIGH/
  MODERATE/LOW/INFORMATIONAL — deliberately never a projected
  compound-risk number), an SOP panel, an operator incident timeline,
  and embedded Digital Twin/Decision Graph snapshots, bidirectionally
  cross-linked with both pages. See `docs/architecture/operations_center.md`.
- **Zone detail** — current risk, a rising/falling trend indicator,
  and a history chart drawn with straight line segments only (no
  smoothing or interpolation of values the backend didn't return).
- **Scenario Library / Replay** — deterministic pre-authored incidents,
  replayed on a shared scrubbable timeline that drives the plant map,
  per-zone cards, pipeline diagram, recommendations, and a
  plant-wide summary strip all at once.
- **Explainability / Research Mode** — a clickable pipeline diagram
  (Sensors → Context Builders → four agents → Fusion → Tiering →
  Recommendations); every number in the detail panel is the exact
  persisted value, never recomputed for display.
- **Counterfactual Comparison** — the naive single-sensor baseline
  next to the compound engine's verdict for the same data, so a
  divergence is shown, not just claimed.
- **Executive Command Center** — an 8-card KPI grid, a Plant Readiness
  label, an Active Alerts list, and an Action Centre of prioritized
  recommendations across every zone.
- **Decision Journal** — every escalation, searchable and filterable,
  with expandable reasoning.
- **Decision Comparison** — two points in time (or two zones) shown
  side by side with the specific factor that explains the difference.
- **Demo Mode / Presentation Mode** — a one-button guided tour of the
  platform's own strongest evidence, and a full-screen, minimal-chrome
  layout (`P` to toggle) for projector use.
- **Scenario Builder** — compose a new incident (sensor events, permit
  events) from already-existing zones/sensors/workers on a draggable
  timeline, validate it, and execute it through the same unmodified
  pipeline every pre-authored scenario runs through — no YAML editing
  required. See `docs/architecture/scenario_builder.md`.
- **Permits** — active/flagged/suspend-recommended groups, filterable
  by zone and status, each card expandable to its baseline snapshot.
- **Audit** — currently always empty by design; the hash-chained
  audit-log writer is deferred (`GET /api/v1/audit` correctly returns
  `[]`, not an error).

## Database: PostgreSQL, TimescaleDB optional

This project runs fully on **standard PostgreSQL** — no extension
required. `alembic upgrade head` detects whether the TimescaleDB
extension is installed on your server (via PostgreSQL's own
`pg_available_extensions` catalog) and only then enables it and
converts `sensor_readings`/`risk_assessments` into hypertables for
time-series query optimization. On a plain PostgreSQL install (the
common case for a judge or contributor evaluating this project on
their own machine), both tables are created as ordinary PostgreSQL
tables instead — every column, index, constraint, repository, and API
response is identical either way. Nothing in this codebase depends on
TimescaleDB being present.

There is exactly **one** `DATABASE_URL` format, used identically by
Alembic, the seed script, the simulation runner, and the API server —
no separate escaping rules for any one of them. If your password
contains a character that isn't valid in a URL (e.g. `#`, `@`, `:`,
`%`), percent-encode it once, the normal way (a literal `#` becomes
`%23`):

```
DATABASE_URL=postgresql+psycopg://postgres:mypass%23word@localhost:5432/isip
```

## Installation

Requires Python 3.12+, Node 20+, and either Docker or a local
PostgreSQL instance (TimescaleDB optional — see above).

```bash
git clone <this-repo>
cd industrial-safety-intelligence
python -m venv .venv
.venv\Scripts\activate        # Windows; `source .venv/bin/activate` elsewhere
pip install -r requirements-dev.txt
pre-commit install

cd frontend
npm install
cd ..
```

## Running locally (without Docker)

```bash
# 1. Point DATABASE_URL at a running Postgres (see .env.example)
alembic upgrade head
python -m src.infra.db.seed

# 2. Replay the authored demo scenario so the dashboard has data to show
python -c "from pathlib import Path; from src.services.simulation_runner import run_scenario; run_scenario(Path('scenarios/demo_vizag_clairton.yaml'))"

# 3. Backend
uvicorn src.api.main:app --reload

# 4. Frontend (separate terminal)
cd frontend
cp .env.example .env.local   # VITE_API_BASE_URL, matching your backend port
npm run dev
```

Then confirm:

```bash
curl http://localhost:8000/api/v1/health
# {"status":"ok","database":"connected","migration_version":"0002"}
```

## Docker deployment

**Local development** (Postgres + Redis + Chroma + backend, hot-reload):

```bash
cp .env.example .env
docker compose -f deploy/docker-compose.yml up
```

**Production** (Postgres + backend + nginx serving the built frontend
and reverse-proxying `/api/` to the backend — one public port, no
CORS needed since everything is same-origin):

```bash
cp .env.example .env
docker compose -f deploy/docker-compose.prod.yml up --build
```

Then open `http://localhost/`. Postgres data persists in the
`pgdata_prod` named volume across restarts. Redis/Chroma are
intentionally omitted from the production stack — nothing in this
codebase consumes them yet (see "Future work"); they remain in the
dev compose file for when their first real consumer is built.

> **Docker was never available in the sandbox that built this
> platform.** Every asset under `deploy/` has been reviewed and its
> YAML validated for syntax, and the images/services they describe
> have been run and verified individually outside of Compose (a real
> Postgres, a real `uvicorn` process, a real `nginx` reverse-proxy
> config reviewed against a running backend) - but `docker compose up`
> itself has never been executed end-to-end. Treat this as your first
> thing to verify in an environment where Docker is available.

## REST API

Versioned under `/api/v1`. Every value returned is read directly from
what the deterministic engine already computed and persisted — this
layer computes nothing itself. Almost every endpoint is read-only; the
two exceptions are the Scenario Builder's `/scenario-builder/validate`
and `/scenario-builder/execute` (see below and
`docs/architecture/scenario_builder.md`).

| Endpoint | Description |
|---|---|
| `GET /api/v1/health` | Process, database connectivity, and migration version |
| `GET /api/v1/zones` | Human-readable zone list (id, name, section, classification) |
| `GET /api/v1/zones/{zone_id}/workers/count` | Current headcount in a zone, from `WorkerRepository` |
| `GET /api/v1/zones/{zone_id}/sensors` | Every sensor monitoring a zone (Scenario Builder) |
| `GET /api/v1/zones/{zone_id}/equipment` | Every equipment record in a zone, read-only (Scenario Builder) |
| `GET /api/v1/workers` | Every worker (Scenario Builder's authorizing-officer picker) |
| `GET /api/v1/risk/current` | Latest `RiskAssessment` per zone |
| `GET /api/v1/risk/history/{zone_id}` | Paginated history for one zone, newest first |
| `GET /api/v1/risk/assessment/{assessment_id}` | One assessment by id (deep-links Explainability/Research Mode) |
| `GET /api/v1/scenarios` | Catalog of deterministic pre-authored scenarios |
| `GET /api/v1/scenarios/{key}` | One scenario's metadata (zones, time window, description) |
| `GET /api/v1/scenario-builder/options` | Frozen curve/permit/gas-type reference data |
| `POST /api/v1/scenario-builder/validate` | Dry-run validation of a builder-authored scenario, no writes |
| `POST /api/v1/scenario-builder/execute` | Persist + run a builder-authored scenario through the unmodified pipeline |
| `GET /api/v1/replay` | Time Machine: a merged, ordered replay timeline + auto-detected bookmarks, from `scenario_key` or an explicit `zone_ids`/`start`/`end` window |
| `GET /api/v1/counterfactual/{zone_id}` | Naive single-sensor baseline vs. the compound engine, same tick |
| `GET /api/v1/permits` | Permits, filterable by `zone_id`/`status` |
| `GET /api/v1/audit` | Audit log entries (always empty today — writer deferred) |
| `GET /metrics` | Prometheus exposition format (request count/duration/status) |

Interactive docs: `http://localhost:8000/docs` (Swagger UI) or
`/redoc`, generated from the same OpenAPI metadata FastAPI derives
from every router, schema, and response model.

Every error response shares one envelope regardless of which router
or failure mode produced it:
```json
{"error": {"code": "VALIDATION_ERROR", "message": "...", "details": {...}}}
```

## Frontend

Vite + React 19 + TypeScript + TanStack Query, polling the REST API
(default 5s, adjustable in the nav bar). One centralized API client
(`frontend/src/api/`) — no component calls `fetch()` directly. Full
detail in `docs/frontend/README.md` (component hierarchy, state
management, polling strategy, known limitations).

## Testing

```bash
# Backend - requires a live Postgres (DATABASE_URL in .env)
pytest                    # 294 tests: unit (pure functions) + integration (real DB)
ruff check .
black --check .
mypy src

# Frontend
cd frontend
npm run lint
npm run build
npm test                  # Vitest + React Testing Library + MSW
```

> **Note on the integration test suite:** several integration tests
> run `alembic upgrade`/`downgrade` around themselves against
> whichever database `DATABASE_URL` points at. If you run `pytest`
> against the same database your dev server is using (rather than a
> disposable one), its teardown will drop your seeded/replayed data —
> re-run `alembic upgrade head`, `python -m src.infra.db.seed`, and the
> scenario replay step above to restore it. Point `DATABASE_URL` at a
> separate database for routine test runs to avoid this entirely.

Both suites run in CI on every push (`.github/workflows/ci.yml`) —
the frontend job pins Node 20 specifically because a newer local Node
was found during verification to break MSW's request interception
(a test-tooling gap, not an application defect; see
`docs/frontend/README.md`'s "Known limitations").

## Project structure

```
src/
  api/          FastAPI app, routers, schemas, error contract, metrics
  services/     Context Builders, Risk Pipeline, Simulation Runner
  domain/       The frozen deterministic engine (agents, orchestrator, simulation)
  infra/db/     SQLAlchemy models, repositories, Alembic migrations, seed data
  config/       Settings (env-driven) and structured logging
frontend/       Vite + React dashboard (see frontend/README.md)
tests/          unit/ (pure functions) and integration/ (real database)
docs/           architecture, algorithms, ADRs, frontend docs
deploy/         Dockerfiles, dev and production Compose stacks, nginx config
scenarios/      Deterministic YAML scenarios (also used as regression fixtures)
.github/        CI workflow
```

## Future work

Not built, and deliberately out of scope for every milestone so far —
see `docs/architecture/integration_readiness.md`'s "Remaining
subsystems" table for the full dependency graph:

- WebSocket streaming (Redis pub/sub) for push updates instead of polling
- Geospatial heatmap bound to live risk-score state
- Alerting (SMS on CRITICAL, human-confirm suspension workflow)
- RAG incident intelligence (Chroma-backed retrieval, citation-or-nothing)
- Isolation Forest anomaly overlay + a PPE-detection demo
- Authentication & RBAC
- A `POST /api/v1/simulation/run` endpoint and a `GET /api/v1/zones`
  name endpoint — both identified during frontend verification as
  useful, minimal additions; neither implemented without separate
  approval (see `docs/frontend/README.md`)
- A hash-chained audit-log writer (the read endpoint exists; nothing
  writes to it yet)
- An index on `risk_assessments(zone_id, timestamp)` before any real
  load testing

## Presentation & demo assets

`docs/demo/` holds everything built for a live judged demo: a timed
walkthrough script (`demo_script.md`), a judge-facing FAQ
(`judge_walkthrough.md`, `faq.md`, `common_questions.md`), a slide
deck outline (`slides.md`), a poster content plan (`poster.md`), an
architecture animation shot list (`architecture_animation_plan.md`),
and a portfolio screenshot checklist (`portfolio_screenshots.md`).
None of these fabricate a claim the live app can't back up — every
number they cite was read from a real run of the system.

## License

No license file exists in this repository yet — this is a decision
for the repository owner, not one this document makes on their
behalf. Add a `LICENSE` file before any public release.
