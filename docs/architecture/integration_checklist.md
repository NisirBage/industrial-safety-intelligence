# Final integration checklist

> **Engine status: FROZEN.** See `docs/architecture/CORE_FREEZE.md`
> for the canonical freeze record. The first two rows below are
> read-only infrastructure from this point forward, not active
> development.

Documentation only. One status per remaining milestone —
**Completed**, **Pending** (unblocked, ready to start once approved),
**Blocked** (its immediate dependency is not yet done), or **Not
Started** (further down the dependency chain, no immediate blocker
being worked yet). See `docs/architecture/integration_readiness.md`
for the reasoning behind each dependency.

| Milestone | Status | Depends on | Notes |
|---|---|---|---|
| Deterministic engine (M0–M5, Justification Builder, Counterfactual Comparator) | **Completed — Frozen** | — | Frozen as of the Architecture Checkpoint and re-confirmed by the Verification & Architecture Audit; see `docs/architecture/CORE_FREEZE.md` and `docs/architecture/frozen_interfaces.md`. |
| System Integration Layer (Context Builders + `risk_pipeline.py`) | **Completed — Frozen** | Deterministic engine | Repositories → Context Builders → Scheduler → Fusion → Tiering → Justification → `RiskAssessment` persistence → commit → Counterfactual → Comparison, implemented and tested end to end. Read-only per `docs/architecture/CORE_FREEZE.md` §15. |
| M6 — Core REST API | **Completed** | System Integration Layer | `GET /risk/current`, `/risk/history/{zone_id}`, `/permits`, `/audit` implemented, tested, and approved. Scoped to the REST API only for this pass — the hash-chained audit-log writer remains deferred (`/audit` correctly returns an empty list). |
| End-to-End Integration Verification & Production Hardening ("M7" — a session-specific milestone, not the Master Plan's M7) | **Completed, with a documented environment gap at the time** | M6 | Verified everything executable without a live database. Docker/PostgreSQL were unavailable in this sandbox at the time — since resolved for PostgreSQL specifically, see the M9 row below. |
| M8 — Frontend Dashboard Integration (this session's own numbering; built directly against M6's REST API, not gated on the Master Plan's WebSocket layer) | **Completed** | M6 | Overview/Zone/Permit/Audit views, centralized API client, React Query polling. Two missing-backend-capability findings reported, not worked around (no simulation-trigger endpoint, no zone-name endpoint). |
| Master Plan M7 — WebSocket streaming layer | **Pending** | M6 | Still not built; M8's dashboard polls REST instead. |
| M9 — Full System Integration & Live Infrastructure Verification (this session's own numbering, not the Master Plan's M9 heatmap) | **Completed** | M6, M8 | First milestone verified against a real, running PostgreSQL and a real browser+backend pair. Found and fixed two genuine defects (migration `0002` downgrade bug; missing CORS config) — see `docs/architecture/integration_readiness.md`'s "Verification results (M9)". All 245 tests pass against the live database; determinism confirmed across three independent runs. |
| Master Plan M9 — Geospatial heatmap | **Not Started** | M8 | |
| M10 — Alerting layer | **Not Started** | M6, M7 | |
| M11 — RAG incident intelligence | **Not Started** | M6 | Chroma is provisioned (`docker-compose.yml`) but unexercised until this milestone. |
| M12 — Isolation Forest overlay + YOLO PPE demo | **Not Started** | M3, M8 | **Risk flagged in `integration_readiness.md`:** the assumed Gas Risk `anomaly_score` extension point does not exist in the frozen `gas_risk.py` — this milestone's own planning will need to resolve that before implementation, likely via an Architecture Review if it requires touching a frozen interface. |
| M13 — Auth & RBAC | **Not Started** | M6, M8 | |
| M14 — Demo scenario assembly, counterfactual panel, deployment polish | **Not Started** | All above | Includes the deferred golden-scenario + counterfactual DB-backed integration test's demo-facing counterpart. |

## What "Completed" means here

Completed means algorithmically frozen and validated (ruff/black/mypy/
pytest green, self-reviewed, Engineering Report delivered, Architecture
Checkpoint passed) — not "committed to git." Justification Builder,
Counterfactual Comparator, and the System Integration Layer remain
uncommitted pending your explicit commit instruction; that is a
workflow state, not an implementation gap, and does not change their
status here.
