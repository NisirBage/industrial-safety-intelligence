# Industrial Safety Intelligence Platform

AI-assisted early-warning system for industrial plant safety. A
deterministic Compound Risk Engine — never an LLM or trained model —
is the sole authority on risk decisions; AI is scoped strictly to
narrative explanation (see `docs/adr/` and `src/domain/orchestrator/`
for the reserved location of that engine).

## Status

**M0 — Engineering foundations & repo scaffold: complete.** No
business logic exists yet. See `docs/roadmap.md` for what's
deliberately deferred and out of scope.

## Quick start

```bash
cp .env.example .env
docker compose -f deploy/docker-compose.yml up
```

Then confirm the stack is healthy:

```bash
curl http://localhost:8000/api/v1/health
# {"status": "ok"}
```

## Local development (without Docker)

```bash
python -m venv .venv
.venv\Scripts\activate        # Windows
pip install -r requirements-dev.txt
pre-commit install
uvicorn src.api.main:app --reload
pytest
```

## Repository layout

Four backend layers with a strict, one-directional dependency chain:
`api` → `services` → `domain` → `infra`. `domain/` has zero I/O and
zero framework imports — it is the deterministic Compound Risk Engine
and its agents, and it is structurally incapable of importing a
database session or an LLM client.

See `docs/data_model.md` for the schema reference (populated from M1)
and `docs/adr/` for architecture decisions.
