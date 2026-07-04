# Security review (M10)

Documentation only - report findings, do not redesign, per this
milestone's own instruction. Every finding below was verified
directly (a real `pip-audit`/`npm audit` run, a real grep of the
codebase, or a real read of the relevant file) - nothing here is
asserted from memory of what a typical FastAPI app might have wrong.

## CORS

`src/api/main.py`'s `CORSMiddleware`: `allow_origins` is an explicit
list (never `"*"`), so `allow_credentials=True` is spec-compliant.
**Finding (low severity):** `allow_methods=["*"]` is wider than the
API actually needs - every route in `src/api/routers/*` is `GET`
only, so this permits preflight for methods (`POST`, `PUT`, `DELETE`,
etc.) that don't exist on any route and will 405 regardless. Inert
today, but worth narrowing to `["GET"]` if this API stays read-only
(it was previously `["GET"]`; a subsequent explicit instruction widened
it to `["*"]` - noting the tradeoff here rather than silently
reverting it).

## Headers

**Finding (low-medium severity):** No security response headers are
set anywhere - no `X-Content-Type-Options`, `X-Frame-Options`,
`Content-Security-Policy`, or `Strict-Transport-Security`, on either
the FastAPI app or the `deploy/nginx/nginx.conf` reverse proxy.
Low real-world impact today (a read-only JSON API with no
user-generated content and no session cookies has a narrow XSS/
clickjacking surface), but standard defense-in-depth for any public
deployment. Not added here per "report, don't redesign."

**Finding (low severity):** `GET /docs`, `/redoc`, and `/openapi.json`
are enabled by default (FastAPI's default; `docs_url`/`redoc_url`
were never overridden to `None`) - the full OpenAPI schema, including
every error code and example, is publicly readable. Fine for a
portfolio/demo project; a production deployment with anything
sensitive would typically disable these outside a private network.

## Dependency versions

Ran `pip-audit` (queries the real OSV vulnerability database, not
static analysis) against both requirement files:

**`requirements.txt` (production dependencies):**
```
starlette 0.41.3 - 8 known CVEs/advisories, fix versions 0.47.2-1.3.1
```
`starlette` isn't pinned directly - it's resolved transitively by
`fastapi==0.115.6`. This is the one finding in this review with real
production impact: the deployed API runs a `starlette` version with
multiple disclosed vulnerabilities. **Recommended action** (not
applied here): upgrade `fastapi` to a version that pulls a patched
`starlette`, then re-run the full test suite - a dependency bump,
not a redesign, but one that should go through its own change with
test verification rather than being silently bundled into this
report.

**`requirements-dev.txt` (dev-only, never shipped):**
```
pytest 8.3.4  - CVE-2025-71176, fix 9.0.3
black 24.10.0 - CVE-2026-32274, fix 26.3.1
starlette 0.41.3 - same as above (pulled in via httpx/fastapi test deps)
```
Lower real-world risk since none of these run in the deployed
container, but worth bumping in a normal dependency-maintenance pass.

**Frontend (`npm audit`, production and full dependency tree):**
0 vulnerabilities found in either scan.

## SQLAlchemy usage

Grepped every raw-SQL call site in the codebase. Exactly two exist,
both in `src/api/routers/health.py` (added this milestone):
```python
conn.execute(text("SELECT 1"))
conn.execute(text("SELECT version_num FROM alembic_version"))
```
Both are static, hardcoded strings with zero string interpolation or
f-string construction - no user input reaches raw SQL anywhere in
this codebase. Every repository (`src/infra/db/repositories/*`) uses
SQLAlchemy's query-builder API exclusively. **No SQL injection risk
found.**

## FastAPI configuration

- No `debug=True` anywhere (grepped `src/` and `deploy/`).
- No `--reload` baked into `deploy/Dockerfile.backend`'s `CMD` - only
  used as a documented local-dev override in the README, never in the
  production image or compose file.
- No `TrustedHostMiddleware` - low real-world exposure here since
  nginx (in the production topology) already sets `Host` correctly
  and terminates the only public-facing port; would matter more if
  the backend were ever exposed directly.
- Runs as a non-root user in the container (`deploy/Dockerfile.backend`,
  added this milestone).
- No secrets exist yet in `Settings` (no API keys, JWT, or credentials
  beyond the database password, which is already handled via
  `.env`/environment variables, never committed - see M10's
  `.env.example` review). Secret management becomes a real question
  starting at M13 (Auth & RBAC), not before.

## Summary

| Finding | Severity | Action taken |
|---|---|---|
| `starlette` (transitive) has 8 disclosed CVEs | Medium | Reported only - recommend a `fastapi` version bump as its own change |
| `allow_methods=["*"]` wider than the read-only API needs | Low | Reported only |
| No security response headers (CSP, X-Frame-Options, etc.) | Low-Medium | Reported only |
| `/docs`/`/redoc`/`/openapi.json` publicly exposed | Low | Reported only |
| `pytest`/`black` (dev-only) have disclosed CVEs | Low | Reported only |
| SQL injection surface | None found | — |
| Debug/reload flags in production paths | None found | — |
| Frontend dependency vulnerabilities | None found | — |

No finding here was fixed as part of this review, per the milestone's
explicit "report findings, do not redesign" instruction.
