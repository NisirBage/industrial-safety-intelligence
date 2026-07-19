# Deployment Guide

Three deployment paths, in order of recommendation for a hackathon
demo that should also survive being extended into something more
permanent. See `ENVIRONMENT.md` for every variable referenced below,
and `docs/architecture/deployment_readiness.md` for the full audit
behind these recommendations (what infrastructure this platform
genuinely needs vs. doesn't).

**Important, stated plainly**: none of the three options below were
executed end-to-end against a real cloud account in this repository's
own development history — Docker itself is not available in the
sandbox that built this platform (`docker` is not installed here), and
no cloud credentials for Railway/Render/Vercel exist in this
environment. Every command below is the exact, correct command for
each platform's own documented deployment model, verified against this
repository's actual `Dockerfile`s/`requirements.txt`/`package.json` —
but "these commands are correct" and "someone has run them
successfully end to end" are different claims, and only the former is
made here. Treat your first real deployment as the actual verification
step.

## Why this recommendation

This platform needs exactly one piece of real infrastructure:
PostgreSQL (TimescaleDB optional, never required — see
`docs/architecture/deployment_readiness.md`). No Redis, no vector
database, no graph database, no object storage, no LLM API key. That
single fact is what makes **Option A (Railway + Vercel)** the
recommendation: both platforms deploy directly from a GitHub repo with
zero YAML to write, both have a first-class managed Postgres, and
neither charges anything meaningful at hackathon-demo traffic levels.
**Option C (Docker Compose on a VPS)** is the fallback for "I want
everything on one server I control" — this repository already ships a
complete, working `docker-compose.prod.yml` for exactly that case.

---

## Option A (Recommended): Railway (backend + Postgres) + Vercel (frontend)

**Rationale**: Railway's managed Postgres removes the "do I need
TimescaleDB" question entirely (plain Postgres, which this platform
already fully supports); Railway builds directly from
`deploy/Dockerfile.backend` with no changes. Vercel is the simplest
possible host for a static Vite build with zero server-side code.
Splitting frontend and backend across two platforms costs one extra
CORS origin to configure — a fair trade for each platform doing what
it's genuinely best at.

### 1. Database

- Create a new Railway project → **Add a PostgreSQL plugin**. Railway provisions a standard PostgreSQL instance and gives you a `DATABASE_URL` in its own dashboard.
- Copy that `DATABASE_URL` — it will not have a `+psycopg` driver suffix by default; add it: `postgresql+psycopg://...` (SQLAlchemy needs the driver name in the scheme).

### 2. Backend (Railway)

- **New service → Deploy from GitHub repo**, root directory `/`, Dockerfile path `deploy/Dockerfile.backend`.
- Environment variables (Railway's dashboard, not a file):
  ```
  DATABASE_URL=postgresql+psycopg://<from step 1>
  CORS_ALLOWED_ORIGINS=["https://<your-vercel-app>.vercel.app"]
  ```
- **Migration command** (Railway's own "Deploy" hook, or run once manually via Railway's shell):
  ```bash
  alembic upgrade head
  python -m src.infra.db.seed
  python -c "from pathlib import Path; from src.services.simulation_runner import run_scenario; run_scenario(Path('scenarios/demo_vizag_clairton.yaml'))"
  ```
- **Startup command** (Railway auto-detects the Dockerfile's own `CMD`; override only if needed): `uvicorn src.api.main:app --host 0.0.0.0 --port $PORT`
- **Health verification**: Railway's own healthcheck should point at `/api/v1/ready` (checks the database — appropriate for a startup gate); if you configure a separate liveness check, use `/api/v1/live` (process-only, never fails over a transient DB blip).

### 3. Frontend (Vercel)

- **Import the GitHub repo**, set the **root directory to `frontend/`**.
- Build command: `npm run build` (Vercel auto-detects Vite).
- Output directory: `dist`.
- Environment variable: `VITE_API_BASE_URL=https://<your-railway-backend>.up.railway.app`
- Deploy.

### 4. Health verification (both platforms)

```bash
curl https://<your-railway-backend>.up.railway.app/api/v1/health
# {"status":"ok","database":"connected","migration_version":"0002"}
curl https://<your-vercel-app>.vercel.app/
# should return the built index.html
```

### 5. Rollback

- **Backend**: Railway keeps every previous deployment; its dashboard has a one-click "Redeploy" on any prior build. No database rollback is implied by a code rollback — if the failed deploy included a new Alembic migration, run `alembic downgrade -1` against the same `DATABASE_URL` before rolling the code back, or the rolled-back code will be out of sync with the schema.
- **Frontend**: Vercel's dashboard → Deployments → "Promote to Production" on any prior build — instant, no rebuild needed.

---

## Option B: Render (backend + Postgres + static site, one platform)

**Rationale**: if you'd rather manage one platform instead of two, Render offers a managed Postgres, a Docker-based web service, and a static site host, all in one dashboard and one `render.yaml` if you want infrastructure-as-code.

### 1. Database
- Render dashboard → **New → PostgreSQL**. Copy the **Internal Database URL** it gives you (starts `postgresql://`) and add the driver: `postgresql+psycopg://...`.

### 2. Backend
- **New → Web Service** → connect the GitHub repo → **Environment: Docker**, Dockerfile path `deploy/Dockerfile.backend`.
- Environment variables: same `DATABASE_URL`/`CORS_ALLOWED_ORIGINS` pattern as Option A.
- Render's **Health Check Path**: `/api/v1/ready`.
- **Migration/seed/replay commands**: run once via Render's Shell tab, identical commands to Option A step 2.

### 3. Frontend
- **New → Static Site** → root directory `frontend/`, build command `npm run build`, publish directory `dist`.
- Environment variable at build time: `VITE_API_BASE_URL=https://<your-render-backend>.onrender.com`.

### 4. Health verification / Rollback
- Same `curl` checks as Option A.
- Render's dashboard keeps every deploy; "Rollback" is one click, same database-migration caveat as Option A applies.

---

## Option C: Docker Compose on a single VPS

**Rationale**: this repository already ships a complete, tested-by-static-review `docker-compose.prod.yml` — Postgres + backend + nginx (serving the built frontend and reverse-proxying `/api/`), one public port, no CORS configuration needed since everything is same-origin. Choose this if you want full control on infrastructure you already manage, or no dependency on a third-party PaaS at all.

### 1. Provision a VPS
Any VPS with Docker + Docker Compose installed (a $5–6/mo instance is plenty at demo scale — see "Estimated Monthly Cost" in the final report).

### 2. Clone and configure
```bash
git clone <this-repo>
cd industrial-safety-intelligence
cp .env.example .env
# Edit .env: set a real POSTGRES_PASSWORD (never leave it as "postgres"
# on a machine reachable from the internet).
```

### 3. Build and start
```bash
docker compose -f deploy/docker-compose.prod.yml up --build -d
```
This builds both images and starts `db` → `backend` (waits for `db`'s
healthcheck) → `nginx` (waits for `backend`'s healthcheck), in that
order, per the `depends_on: condition: service_healthy` chain already
in the compose file.

### 4. Migrate and seed (one-time, inside the running backend container)
```bash
docker compose -f deploy/docker-compose.prod.yml exec backend alembic upgrade head
docker compose -f deploy/docker-compose.prod.yml exec backend python -m src.infra.db.seed
docker compose -f deploy/docker-compose.prod.yml exec backend python -c "from pathlib import Path; from src.services.simulation_runner import run_scenario; run_scenario(Path('scenarios/demo_vizag_clairton.yaml'))"
```

### 5. Health verification
```bash
curl http://<your-vps-ip>/api/health   # nginx proxies /api/ to the backend
```
Open `http://<your-vps-ip>/` in a browser for the frontend.

### 6. Rollback
```bash
git checkout <previous-known-good-commit>
docker compose -f deploy/docker-compose.prod.yml up --build -d
# If the bad deploy included a new migration:
docker compose -f deploy/docker-compose.prod.yml exec backend alembic downgrade -1
```
Postgres data persists in the `pgdata_prod` named volume across
`down`/`up` cycles — only `docker compose down -v` (note the `-v`)
destroys it.

### 7. HTTPS
`docker-compose.prod.yml` serves plain HTTP on port 80. For a
publicly reachable deployment, put a TLS-terminating reverse proxy in
front (Caddy or an nginx config with a Let's Encrypt certificate,
or your VPS provider's own load balancer) — this is standard practice
left to your infrastructure choice rather than baked into this
repository's own nginx config, which is scoped to the internal
frontend↔backend proxy only.

---

## Every option: what "success" looks like

```bash
curl <backend-url>/api/v1/health
# {"status":"ok","database":"connected","migration_version":"0002"}
curl <backend-url>/api/v1/ready
# same shape, same meaning - use for a load balancer's readiness gate
curl <backend-url>/api/v1/live
# {"status":"ok","database":"not_checked"} - use for a liveness/restart gate only
```
Then open the frontend URL and confirm the Overview page renders real
zone data (not an error state) — this proves the seed + scenario
replay steps actually ran.
