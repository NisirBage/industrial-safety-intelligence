# Data model

Canonical schema reference, kept in sync with the Alembic migrations
under `src/infra/db/migrations/`. For *why* the schema is shaped this
way (naming, FK/`ON DELETE` policy, enum representation, indexing,
migration philosophy), see `docs/schema_decisions.md`. This file is
the *what*: the ten tables and their columns as of M1.

## zones

| Column | Type | Notes |
|---|---|---|
| zone_id | UUID PK | |
| name | text | |
| oisd_area_classification | text, CHECK | `zone_0` / `zone_1` / `zone_2` / `unclassified` |
| plant_section | text | |
| elevated_floor_override | numeric, nullable | per-zone override, read by M5 |

## zone_adjacency

| Column | Type | Notes |
|---|---|---|
| zone_id | UUID, PK, FK → zones (CASCADE) | |
| adjacent_zone_id | UUID, PK, FK → zones (CASCADE) | CHECK: not equal to zone_id |

## sensors

| Column | Type | Notes |
|---|---|---|
| sensor_id | UUID PK | |
| zone_id | UUID, FK → zones (RESTRICT) | |
| gas_type | text, CHECK | CO / H2S / CH4 / O2 / COG_pressure / BFG_pressure |
| last_calibrated_at | timestamptz, nullable | |
| alarm_threshold | numeric | |

## sensor_readings (hypertable, 1-day chunks)

| Column | Type | Notes |
|---|---|---|
| reading_id | UUID, part of composite PK | |
| sensor_id | UUID, FK → sensors (CASCADE) | |
| zone_id | UUID, FK → zones (RESTRICT) | denormalized for query speed |
| gas_type | text, CHECK | same list as `sensors.gas_type` |
| value | numeric | |
| unit | text | |
| timestamp | timestamptz, part of composite PK | hypertable partition key |
| quality_flag | text, CHECK | ok / stale / out_of_calibration |

Indexes: `(zone_id, timestamp DESC)`, `(sensor_id, timestamp DESC)`.

## permits

| Column | Type | Notes |
|---|---|---|
| permit_id | UUID PK | |
| permit_type | text, CHECK | hot_work / confined_space / electrical_isolation / line_break |
| zone_id | UUID, FK → zones (RESTRICT) | |
| issued_at | timestamptz | |
| expires_at | timestamptz | |
| authorizing_officer_id | UUID, FK → workers (RESTRICT) | |
| baseline_snapshot | jsonb | written once at issuance, never mutated |
| status | text, CHECK | active / flagged / suspend_recommended / closed |

Indexes: `(zone_id, status)`, `(status, expires_at)`.

## workers

| Column | Type | Notes |
|---|---|---|
| worker_id | UUID PK | |
| role | text, CHECK | operator / supervisor / safety_officer / contractor / auditor |
| current_zone_id | UUID, nullable, FK → zones (SET NULL) | |
| last_position_update | timestamptz, nullable | |

## equipment

| Column | Type | Notes |
|---|---|---|
| equipment_id | UUID PK | |
| zone_id | UUID, FK → zones (RESTRICT) | |
| equipment_type | text | |
| isolation_status | text, CHECK | isolated / active / degraded |
| maintenance_flag | boolean | default false |
| loto_confirmed | boolean | default false |

## incidents

Relational metadata only — no embedding column. See
[ADR 0001](adr/0001-incidents-embedding-storage.md).

| Column | Type | Notes |
|---|---|---|
| incident_id | UUID PK | |
| source | text, CHECK | internal_near_miss / historical_case / regulatory_bulletin |
| description | text | |
| linked_zone_id | UUID, nullable, FK → zones (SET NULL) | |
| date | date | |

## risk_assessments (hypertable, 1-day chunks)

The Compound Risk Engine's output history. M1 creates this table; M5
(Orchestrator) writes to it.

| Column | Type | Notes |
|---|---|---|
| assessment_id | UUID, part of composite PK | |
| zone_id | UUID, FK → zones (RESTRICT) | |
| timestamp | timestamptz, part of composite PK | hypertable partition key |
| compound_risk_score | numeric | |
| confidence | numeric | |
| tier | text, CHECK | watch / elevated / critical |
| justification | jsonb | frozen shape below |

`justification` shape (Master Plan A.4), a contract for M5's writer
and M6/M11's readers — not enforced at the database level:

```json
{
  "schema_version": 1,
  "rules_fired": ["..."],
  "agent_contributions": { "agent_name": { "risk": 0.0, "confidence": 0.0 } },
  "interaction_bonus_applied": 0.0,
  "tier_before": "watch",
  "tier_after": "elevated"
}
```

## audit_log

M1 creates this table only. M6 owns the write logic, including the
chained-hash tamper-evidence field the Domain Research Report
recommends — not added here since M6 hasn't defined how the hash
chain works yet.

| Column | Type | Notes |
|---|---|---|
| log_id | UUID PK | |
| event_type | text, CHECK | risk_computed / permit_flagged / alert_sent / action_confirmed |
| actor | text | `"system"` or a worker_id string, not a foreign key |
| zone_id | UUID, nullable, FK → zones (RESTRICT) | added in M1 to make the RESTRICT-on-delete test possible — see docs/schema_decisions.md |
| payload | jsonb | full context snapshot, immutable |
| timestamp | timestamptz | server-side default `now()` |

## Retention

No retention policy is enforced during the hackathon build — data
volume is trivially small. The intended production policy (90-day
hot, cold-storage rollup beyond) is recorded here as a stated
deferral, not a silent omission, per Master Plan A.4.
