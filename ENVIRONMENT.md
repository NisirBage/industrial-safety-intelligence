# Environment Variables

Every variable this platform reads, in one place. Copy `.env.example`
to `.env` and adjust as needed — `.env` is gitignored and must never
be committed. There is exactly **one** `DATABASE_URL` format, read
identically by Alembic, the seed script, the simulation runner, and
the API server (no separate escaping rules for any one of them — see
`docs/architecture/deployment_readiness.md` for the historical bug
this guarantee fixed).

| Variable | Required | Default | Read by | Description |
|---|---|---|---|---|
| `DATABASE_URL` | No (has a working default) | `postgresql+psycopg://postgres:postgres@localhost:5432/isip` | `src/config/settings.py` | Full PostgreSQL connection string. TimescaleDB is auto-detected and used if the extension is installed on the target server; a standard PostgreSQL installation works identically. **Validated at process startup** — a malformed URL or non-`postgresql` driver fails immediately with a clear error rather than at the first query. If your password contains a URL-special character (`#`, `@`, `:`, `%`), percent-encode it once, the normal way (`#` → `%23`). |
| `APP_NAME` | No | `industrial-safety-intelligence` | `src/config/settings.py` | Cosmetic — appears in the FastAPI OpenAPI title and startup log line only. |
| `CORS_ALLOWED_ORIGINS` | No | `["http://localhost:5173","http://localhost:5174","http://127.0.0.1:5173","http://127.0.0.1:5174","http://localhost:5180"]` | `src/config/settings.py` | JSON array of full origins (scheme + host + port) allowed to call the API cross-origin. Never set to `"*"` — `allow_credentials=True` is enabled, and a wildcard origin combined with credentials is unsafe per the CORS spec. Not needed at all in the nginx-reverse-proxy production topology (`deploy/docker-compose.prod.yml` defaults it to `[]` there), since the browser only ever talks to nginx's own origin. |
| `POSTGRES_USER` | No | `postgres` | `deploy/docker-compose*.yml` only (not read by the Python app directly) | Used to configure the `db` service's own superuser when Docker Compose provisions Postgres itself. |
| `POSTGRES_PASSWORD` | No | `postgres` | `deploy/docker-compose*.yml` only | Same as above. **Change this for any deployment reachable outside your own machine.** |
| `POSTGRES_DB` | No | `isip` | `deploy/docker-compose*.yml` only | Database name Compose creates inside the `db` service. |
| `VITE_API_BASE_URL` | No | `http://localhost:8000` (dev) / `""` (production image) | `frontend/src/api/client.ts` (build-time, Vite) | Base URL the frontend calls. Empty string means "same origin as the page" — this is what makes the nginx reverse-proxy topology work without any CORS configuration at all. Set at **build** time (`docker build --build-arg VITE_API_BASE_URL=...`), not at container-start time — Vite bakes it into the built JS bundle. |

## Not yet configurable (because nothing reads them)

There is no environment variable for Redis, Chroma, a vector database,
a graph database, object storage, or any LLM API key — none of these
are consumed by any code path in this repository today (see
`docs/architecture/deployment_readiness.md`'s infrastructure audit).
Adding one of these as a real dependency in the future should add its
own settings field to `src/config/settings.py` at that time, following
the same pattern `database_url` already establishes (a typed field,
a sensible default where one exists, and a startup validator if the
value can be malformed in a way that should fail fast rather than at
first use).

## Validating your own `.env`

```bash
python -c "from src.config.settings import get_settings; print(get_settings().database_url)"
```

If this raises a `ValueError` mentioning "not a valid SQLAlchemy
connection string" or "must use a postgresql driver", your
`DATABASE_URL` is malformed — the error message states exactly what's
wrong. If it prints your DSN back with no error, the value itself
parses correctly (this does not test the database is actually
reachable — use `GET /api/v1/ready` for that, once the server starts).
