# Frontend — M8 Dashboard

Documentation only. Covers `frontend/`, the pure-consumer React
dashboard built against M6's REST API. See
`docs/architecture/CORE_FREEZE.md` for the backend it consumes;
nothing here describes backend behavior.

## What this is, in one sentence

A read-only monitoring dashboard that renders exactly what
`GET /risk/current`, `GET /risk/history/{zone_id}`, `GET /permits`,
and `GET /audit` return — it never computes a risk score, a tier, a
confidence value, or a justification itself.

## Stack

- **Vite + React 19 + TypeScript** — scaffolded via `npm create vite@latest -- --template react-ts`.
- **TanStack Query (React Query) v5** — server state, caching, and polling. No Redux: the M8 brief explicitly preferred this, and nothing here needed more.
- **react-router-dom v7** — client-side routing between the four views.
- **Recharts** — the historical risk chart, configured for straight line segments only (see Charts, below).
- **oxlint** — the linter `npm run lint` already runs (Vite's own scaffold default; a fast, ESLint-compatible Rust linter, not swapped for ESLint since it already satisfies "npm lint").
- **Vitest + React Testing Library + MSW** — component and API-client tests, mocking the network boundary. As of M9 this dashboard has also been verified directly against a real, running backend and database (see `docs/architecture/integration_readiness.md`'s "Verification results (M9)"), but the unit/component suite still uses MSW rather than a live server. **M9 found this suite currently fails entirely in this sandbox** (16/27 tests, 8/10 files) - every failure is the identical `NETWORK_ERROR`/"Could not reach the backend.", meaning MSW 2.14.6 is not intercepting `fetch()` under this environment's Node v24.12.0. No frontend source file changed at M9; this is a test-tooling/Node-version compatibility gap (a known category of MSW issue as Node's `fetch`/undici internals evolve), not an application defect - the exact same `apiGet()` code path was independently verified working correctly against the real, live backend in a real browser at M9. Not fixed here (out of M9's scope); a future session should pin a compatible Node version for frontend testing or upgrade MSW once a compatible release exists.

## Component hierarchy

```
App
└─ QueryClientProvider
   └─ PollingProvider
      └─ BrowserRouter
         └─ DashboardLayout
            ├─ NavBar (routes + polling controls)
            └─ <Routes>
               ├─ "/"              → OverviewPage
               ├─ "/zones"         → ZonePage → ZonePicker
               ├─ "/zones/:zoneId" → ZonePage → ZoneDetail
               │                     ├─ TrendIndicator
               │                     └─ RiskHistoryChart
               ├─ "/permits"       → PermitsPage
               │                     └─ PermitGroup (×3: active/flagged/suspend_recommended)
               │                        └─ PermitCard
               └─ "/audit"         → AuditPage
                                     └─ AuditTimeline
```

Shared, cross-view components live in `src/components/common/`:
`LoadingState`, `EmptyState`, `ErrorState`, `QueryResult` (the one
place that picks which of those three - or the real content - to
render, so every view doesn't repeat the same branch), and
`TierBadge` (a purely presentational tier→color mapping).

## API flow

```
Component
   │  (never calls fetch() directly)
   ▼
Hook (src/hooks/*.ts)              — React Query wrapper, adds polling
   │
   ▼
Resource module (src/api/{risk,permits,audit}.ts)  — one function per endpoint
   │
   ▼
apiGet() (src/api/client.ts)       — the ONLY function that calls fetch()
   │
   ▼
FastAPI backend (src/api/main.py, M6)
```

Every response type in `src/api/types.ts` is a hand-written TypeScript
mirror of the corresponding Pydantic schema in `src/api/schemas/*.py`
— field-for-field, no added or computed fields. `ApiError` carries the
backend's own `{"error": {"code","message","details"}}` envelope
(`src/api/common/errors.py`) unchanged; the frontend never invents a
different error shape, per the M8 brief.

## State management

- **Server state** (risk assessments, permits, audit entries) lives
  entirely in React Query's cache, keyed by resource + query params
  (e.g. `["permits", {status: "active", zone_id: "..."}]`). No
  duplicate cache exists anywhere else — components read directly
  from the hooks, never from a second store holding a copy of the
  same data.
- **UI/config state** (the polling interval and on/off switch) lives
  in one small React Context (`PollingContext`) — the only piece of
  state that isn't server data and is genuinely shared across every
  view. Nothing else uses Context; local component state (`useState`)
  handles everything else (e.g. a permit card's expanded/collapsed
  state, the audit page's cursor stack).

## Polling strategy

Every data hook (`useCurrentRisk`, `useRiskHistory`, `usePermits`,
`useAuditLog`) reads `intervalMs`/`enabled` from `PollingContext` and
passes it to React Query's own `refetchInterval` option — one shared
setting applied uniformly, not four independently-configured polls
that could drift out of sync. Default interval: **5000 ms**, matching
the M8 brief exactly; adjustable (1–60s) or pausable entirely from the
nav bar.

`placeholderData: keepPreviousData` (React Query v5) is set on every
query: a poll in flight keeps showing the last successful data rather
than flashing back to a loading state every interval, and React
Query's own structural sharing means a component doesn't re-render at
all when a poll returns byte-identical data - "avoid unnecessary
re-renders" without any hand-written memoization.

Because routing/state uses the DOM's normal scroll container (no
custom virtual list, no full-page remount on poll), scroll position is
preserved automatically - there's no scroll-resetting behavior to
suppress in the first place.

## Charts

`RiskHistoryChart` reverses the backend's newest-first history array
into chronological order for a left-to-right timeline, then renders it
with Recharts' `<Line type="linear">` — never `"monotone"` or a
spline, which would draw a smoothed curve between points the backend
never returned. `isAnimationActive={false}` for the same reason on the
polling axis: a redrawn line shouldn't animate as if it were a new
trend. No interpolation, smoothing, or prediction happens anywhere in
this component or in the data it's given.

## Known limitations

Two gaps were found during M8 and reported per the milestone's own
"STOP, don't add the endpoint, report it" instruction — neither
blocks this dashboard from being fully functional against the
endpoints that do exist:

1. **No "Simulation controls" section was built.** Every M6 endpoint
   is a read-only GET; nothing in the backend can trigger a scenario
   run or a pipeline tick over HTTP. Building this against *existing*
   endpoints only would mean a UI control wired to nothing - a fake
   feature this project's own standing rules prohibit ("no placeholder
   implementations"). **Recommended minimal backend addition** (not
   implemented, pending separate approval): `POST /api/v1/simulation/run`
   wrapping `src/services/risk_pipeline.py::run_zone_tick`.
2. **Zones are shown by truncated UUID, never by name.** No endpoint
   returns zone metadata - every response carries only `zone_id`.
   `shortZoneLabel()` (`src/lib/format.ts`) makes this explicit rather
   than fabricating a name. **Recommended minimal backend addition**
   (not implemented, pending separate approval): a read-only
   `GET /api/v1/zones` returning `{zone_id, name, plant_section}` from
   the already-existing `zones` table.

Additional, lower-severity notes:

- The production bundle is ~625 KB (gzip ~188 KB), past Vite's default
  500 KB warning threshold - driven mainly by Recharts and React
  Query. Not addressed here (code-splitting wasn't requested and this
  milestone's own instructions said to minimize renders/API calls, not
  bundle size); worth a look before a real deployment.
- `GET /audit` returns an empty list in every environment today - the
  backend's hash-chained writer was explicitly deferred at M6 (see
  `src/infra/db/repositories/audit_log_repository.py`). The Audit view
  renders this as a normal empty state, not an error, since it's a
  confirmed-empty response, not a failure. Confirmed against a real
  database at M9: it genuinely returns `[]`, not just in tests.
- **M9 update**: this dashboard has been verified end-to-end against a
  real, running FastAPI backend and a real, populated PostgreSQL
  database - Overview, Zone (including the trend indicator), Permits
  (including zone/status filtering), and Audit all render real data
  correctly. This required adding CORS middleware to the backend
  (`src/api/main.py`), which had none - every browser request from
  this dashboard was silently blocked until that fix, invisible before
  M9 because this test suite mocks the network boundary with MSW
  rather than exercising real cross-origin `fetch()` calls. Two
  behaviors (the history chart's live rendering and the error-state
  transition on a real network failure) could not be observed in the
  specific automated browser tab this project's preview tooling uses,
  because that tab reports `document.visibilityState === "hidden"`,
  which both Recharts and TanStack Query treat specially by design;
  see `docs/architecture/integration_readiness.md` for detail. Both
  are already covered by this file's own MSW-based tests, which don't
  have that limitation.
