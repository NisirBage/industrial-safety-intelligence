# Deployment Realism

M27 Part 11. This document is the honest bridge between "what M27 built"
and "what a real enterprise deployment of this platform would look
like" - it distinguishes what is genuinely implemented and running in
this repository today from what is deliberately documented-only or
mocked, and why.

## Frozen engine compliance

Documentation only - no code changes. Nothing in `src/domain/` is
referenced or affected.

## Connector architecture (recap of M27 Part 4)

```
                     ┌─────────────────────┐
  CSV file  ────────▶│  csv_watcher.py      │──┐
  (local process)     │  (real, implemented) │  │
                     └─────────────────────┘  │
                                               │
  POST /ingest/reading ─────────────────────┐  │
  (real, implemented)                       │  │
                                             ▼  ▼
                                    ┌───────────────────┐
  POST /ingest/mock/mqtt  ─────────▶│ ingest_reading()   │──▶ SensorReadingRepository
  (mocked adapter)                  │ (src/live_ingestion)│      │
                                    │                    │      ▼
  POST /ingest/mock/opcua ─────────▶│                    │  sensor_readings table
  (mocked adapter)                  └───────────────────┘      │
                                                                ▼
                                            (deterministic engine's own
                                             next scheduled tick picks
                                             up the new reading - no
                                             connector ever computes
                                             risk, tier, or confidence)
```

Every arrow above is real code already in this repository
(`src/live_ingestion/`, `src/api/routers/ingest.py`). The only mocked
pieces are the MQTT and OPC-UA *wire protocols themselves* - see
"Supported protocols" below for exactly what that means.

## Data flow, end to end

```
 Sensor / CSV / REST client / mocked MQTT-OPC-UA poll
        │
        ▼
 SensorReading persisted (src/live_ingestion or src/services/simulation_runner.py)
        │
        ▼
 Scheduler's next tick (src/domain/orchestrator/scheduler.py, unchanged)
        │
        ▼
 Four agents + Fusion + Tiering + Justification (src/domain/, frozen)
        │
        ▼
 RiskAssessment persisted (risk_pipeline.py, unchanged)
        │
        ▼
 REST API (GET /risk/current, /replay, /explain, ...)
        │
        ▼
 Frontend pages (Overview, Digital Twin, Executive, CEO Dashboard, ...)
```

This is unchanged from every prior milestone's own diagram
(`docs/architecture/pipeline.md`) - M27 only adds new *inputs* at the
top (live connectors) and new *consumers* at the bottom (Enterprise
Search, Decision Report, Multi-Plant, Platform Health, CEO Dashboard).
Nothing in the middle changed.

## Supported protocols

| Protocol | Status | What "implemented" or "mocked" means here |
|---|---|---|
| CSV file ingestion | **Implemented** | Real `csv.DictReader` parsing, real per-row validation, real writes through `SensorReadingRepository`. Deliberately not exposed over HTTP (see Security below). |
| REST (HTTP JSON) | **Implemented** | `POST /ingest/reading` is a real, functional write endpoint - the second write endpoint this platform has ever exposed (after Scenario Builder's `/execute`). |
| MQTT | **Mocked** | `MqttConnectorMock` simulates one inbound message per call. It does **not** open a real MQTT broker connection, does not speak the MQTT wire protocol, and has no subscription/QoS/retained-message semantics. A real MQTT connector would need a client library (e.g. `paho-mqtt`), a broker (e.g. Mosquitto/EMQX), TLS + credential handling, and a subscriber loop feeding the exact same `ingest_reading()` function this mock already calls. |
| OPC-UA | **Mocked** | `OpcUaConnectorMock` (subclasses the MQTT mock) simulates one inbound message per call. It does not speak the real OPC-UA binary or SOAP-XML protocol, does not model an address space, node hierarchy, or subscription. A real OPC-UA connector would need a client stack (e.g. `python-opcua`/`asyncua`), certificate-based authentication, and a subscription against the historian's actual node IDs. |

Why mocked rather than skipped: a judge or enterprise evaluator needs
to see "MQTT and OPC-UA data can reach this platform" demonstrated end
to end (a message goes in, a real `SensorReading` row comes out, the
deterministic engine picks it up on its own next tick) - without this
repository taking on a dependency on a real broker or historian that
would make the demo environment fragile. The mock's value is
*intentionally* a deterministic fraction of the sensor's own real
`alarm_threshold` (never `random`), so the same AST-walking discipline
`tests/unit/test_no_wallclock_calls.py` already established for
wall-clock calls extends to randomness here too
(`test_never_uses_randomness_to_derive_a_reading_value`).

## Security note (recap of M27 Part 4)

CSV ingestion is **not** exposed over HTTP. Accepting a server-side
file path from a request body would be a path-traversal risk in a real
deployment (a client could request `../../etc/passwd` or any file the
API process can read). `csv_watcher.py` remains a Python-callable
utility invoked by a local, trusted process with filesystem access -
this is a deliberate scope decision, not a gap.

## Enterprise topology - implemented vs planned

**What this repository actually deploys today** (`docker-compose.yml`,
`docker-compose.prod.yml`, M10): one FastAPI process, one Postgres
instance, one Nginx-served frontend build - a single-plant topology.
Multi-Plant Command Center (M27 Part 5) is a *view*, not a second
plant: it re-presents the one real dataset's cataloged scenarios as
plant cards, honestly labeled as such.

**What a real multi-plant enterprise deployment would add** (planned,
not implemented):

```
                    ┌─────────────────────────┐
                    │   Corporate dashboard    │  (this platform's own
                    │  (aggregates across      │   frontend, one extra
                    │   plant instances)       │   aggregation layer)
                    └───────────┬─────────────┘
                                │  read-only, per-plant REST calls
              ┌─────────────────┼─────────────────┐
              ▼                 ▼                 ▼
     ┌────────────────┐ ┌────────────────┐ ┌────────────────┐
     │ Plant A         │ │ Plant B         │ │ Plant C         │
     │ FastAPI + Postgres + live connectors, one full stack per site │
     └────────────────┘ └────────────────┘ └────────────────┘
```

Each plant would run its own complete, independent stack (this
platform already is that stack); a corporate layer would need a new,
separate read-only aggregation service that calls each plant's REST
API - it would **not** share a database or a deterministic engine
across plants, preserving the same "no second reasoning engine, no
cross-plant fusion" guarantee this platform's architecture has always
required. Building that aggregation service is out of scope for this
milestone and is not implemented; it is documented here so an
evaluator can see the real path from "one demo plant" to "N real
plants" without this repository claiming to already do it.

## Summary: implemented vs planned

| Capability | Status |
|---|---|
| CSV ingestion | Implemented |
| REST ingestion | Implemented |
| MQTT ingestion | Mocked (real protocol client is planned, not implemented) |
| OPC-UA ingestion | Mocked (real protocol client is planned, not implemented) |
| Single-plant deployment (Docker Compose) | Implemented (since M10) |
| Multi-plant *view* over one real dataset | Implemented (M27 Part 5) |
| Multi-plant *corporate aggregation service* across independent plant stacks | Planned, not implemented |
| Enterprise Health Dashboard | Implemented (M27 Part 6) |
