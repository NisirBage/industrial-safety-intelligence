# Troubleshooting

## `alembic upgrade head` fails with `psycopg.errors.UndefinedFunction: function create_hypertable(...) does not exist`

You're running against a standard PostgreSQL installation with no
TimescaleDB extension — **this is expected and handled**. As of this
platform's TimescaleDB-portability fix, migration `0001` detects
whether TimescaleDB is installed (via `pg_available_extensions`) and
only converts tables to hypertables when it genuinely is. If you still
see this error, you're running an older checked-out commit — pull
latest and retry. TimescaleDB is never required.

## `alembic upgrade head` (or the app itself) fails with a password/authentication error

Check `DATABASE_URL` first with:
```bash
python -c "from src.config.settings import get_settings; print(get_settings().database_url)"
```
If this itself raises `ValueError: DATABASE_URL is not a valid
SQLAlchemy connection string`, your password almost certainly contains
a character that needs percent-encoding (`#`, `@`, `:`, `%` are the
common ones) — see `ENVIRONMENT.md`. If it prints a DSN with no error
but the actual connection still fails, the DSN is well-formed but the
credentials/host/port are wrong for your actual Postgres instance —
verify with `psql "<the printed DSN>"` directly.

## `docker compose up` hangs waiting on a service that never becomes healthy

If you're on an older checked-out commit of `deploy/docker-compose.yml`,
it may still reference `redis`/`chroma` services the backend depended
on for no real reason (nothing in this codebase ever used either) —
pull latest; the current dev compose file only has `db` and `backend`.

## `GET /api/v1/health` (or `/ready`) returns `503`

The response body tells you which check failed:
- `"database": "unreachable"` — Postgres isn't running, or `DATABASE_URL` points somewhere unreachable from where the API process runs (a very common one: `localhost` inside a container that needs the Compose service name `db` instead — see `deploy/docker-compose.yml`'s own `DATABASE_URL` override).
- `"database": "connected", "migration_version": null` — the database is reachable but `alembic upgrade head` was never run against it. Run it.

`/api/v1/live` never returns 503 for a database problem by design — if
`/live` itself fails, the process isn't running at all (check container
logs, not this endpoint).

## Frontend loads but every page shows an error / spinner forever

Almost always a `VITE_API_BASE_URL` mismatch. Open the browser's
network tab: if requests are going to the wrong origin (e.g.
`localhost:8000` when your backend is actually deployed elsewhere),
the frontend was built with the wrong value baked in — `VITE_API_BASE_URL`
is a **build-time** variable (Vite inlines it into the JS bundle), so
changing it requires a rebuild, not just a container restart. Also
check the browser console for a CORS error specifically — if so,
`CORS_ALLOWED_ORIGINS` on the backend doesn't include the frontend's
actual origin.

## `npm test` fails in CI but passes locally (or vice versa)

Almost always a Node version mismatch. This project's frontend test
suite (MSW 2.x) has a known incompatibility with Node 24's `fetch()`
interception — CI pins Node 20 for exactly this reason
(`.github/workflows/ci.yml`). Run `node --version` locally; if it's
24+, install/use Node 20 via `nvm`/`fnm` for this repo.

## `pytest` fails with connection errors on every DB-backed test

You don't have a live PostgreSQL instance reachable at your
`DATABASE_URL`. Point it at one (local install, Docker, or a disposable
cloud instance) — the DB-backed integration tests genuinely require a
real database, by design (this project has always tested against real
Postgres for anything schema/persistence-related, never a mock).

## Running `pytest` against the same database your dev server uses wiped my seeded data

Several integration tests run `alembic upgrade`/`downgrade` around
themselves. If `pytest`'s `DATABASE_URL` points at the same database
your `uvicorn`/frontend session is using, test teardown drops your
seeded/replayed data. Re-run:
```bash
alembic upgrade head
python -m src.infra.db.seed
python -c "from pathlib import Path; from src.services.simulation_runner import run_scenario; run_scenario(Path('scenarios/demo_vizag_clairton.yaml'))"
```
Or better: point `DATABASE_URL` at a separate, disposable database for
routine test runs.

## Backup / Restore (any deployment option)

**Backup** (from any machine that can reach your Postgres instance):
```bash
pg_dump "<your DATABASE_URL, without the +psycopg driver suffix>" -F c -f backup.dump
```
**Restore** into a fresh database:
```bash
pg_restore -d "<target DATABASE_URL>" backup.dump
```
This platform has no bespoke backup tooling — standard `pg_dump`/
`pg_restore` against the one database it uses is sufficient, since all
state (zones, sensors, permits, risk assessments, audit log) lives in
that one Postgres instance and nowhere else (no Redis/vector-DB/object
storage to separately back up — see
`docs/architecture/deployment_readiness.md`'s infrastructure audit).

## Monitoring

`GET /metrics` exposes Prometheus-format counters/histograms
(`src/api/common/metrics.py`) for request count/duration/status by
route template. Point a Prometheus instance at it, or scrape it
manually with `curl <backend-url>/metrics` to confirm it's live.
Structured JSON logs (stdout) include a `request_id` on every request
line — grep for one to trace a single request's full log trail.
