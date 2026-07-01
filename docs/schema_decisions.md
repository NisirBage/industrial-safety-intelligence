# Schema decisions

Database-wide conventions for `src/infra/db/`, recorded once here
instead of re-derived per model. The frozen entity/column list itself
lives in `docs/data_model.md`; this file is about the *rules* applied
uniformly across all of it.

## Naming

- Table names match the frozen spec's own names exactly:
  `zones`, `zone_adjacency`, `sensors`, `sensor_readings`, `permits`,
  `workers`, `equipment`, `incidents`, `risk_assessments`, `audit_log`.
- Primary key columns are named `<singular_entity>_id`
  (`zone_id`, `sensor_id`, ...), matching the spec's own field names.
- One model module per table, named after the table's singular form
  (`src/infra/db/models/zone.py` defines `Zone`), mirroring the
  one-file-per-entity convention already used for agents.

## Primary keys

UUIDs, generated client-side via `uuid.uuid4()` (Python `default=`,
not a Postgres `server_default`). Chosen over `gen_random_uuid()`
because it needs no Postgres-version-specific function, works
identically against any test setup, and keeps ID generation visible
in Python rather than implicit in the database.

Hypertables (`sensor_readings`, `risk_assessments`) use a **composite**
primary key of `(id, timestamp)`. This isn't a style choice — Timescale
requires the partitioning column to be part of any unique constraint
on a hypertable, so a single-column UUID primary key would fail at
`create_hypertable()` time.

## Foreign keys and `ON DELETE` policy

Three policies are used, chosen per-column by what the column means,
per the Master Plan's rule ("`audit_log` and `risk_assessments` must
never cascade-delete when a parent zone/permit/sensor row is removed;
use `RESTRICT` for anything feeding the audit trail, `CASCADE` only
for genuinely dependent child rows"):

- **RESTRICT** — the default for anything historical/audit-adjacent:
  `sensors.zone_id`, `sensor_readings.zone_id`, `permits.zone_id`,
  `permits.authorizing_officer_id`, `equipment.zone_id`,
  `risk_assessments.zone_id` (explicitly required by the Master Plan),
  `audit_log.zone_id`.
- **CASCADE** — only for rows that have no meaning without their
  parent: `sensor_readings.sensor_id` (a reading without its sensor is
  meaningless — explicitly given as the Master Plan's own example),
  and both legs of `zone_adjacency` (an adjacency edge without one of
  its two zones is meaningless).
- **SET NULL** — for nullable columns that track *current*, mutable
  state rather than a historical record: `workers.current_zone_id`
  (a worker's last-known position; losing the zone shouldn't force
  deleting the worker) and `incidents.linked_zone_id` (an optional
  cross-reference; losing the zone shouldn't destroy incident history).

### `audit_log.zone_id` — an interpretive addition

The Technical Review's field list for `audit_log` (§7.8) does not
include a `zone_id` column. But M1's own stated testing requirement is
"`ON DELETE RESTRICT` actually prevents deletion of a zone with audit
log entries" — which is only testable if `audit_log` has a zone
reference. A nullable `zone_id` FK (RESTRICT) was added to make that
explicit, Master-Plan-mandated test possible, without inventing
columns beyond what's needed for it (no `permit_id`/`sensor_id` FKs
were added, since neither is named in the example test case).

## Enums: `VARCHAR` + `CHECK`, not native Postgres `ENUM`

Every enum-like column (`gas_type`, `oisd_area_classification`,
`permit_type`, `status`, `role`, `isolation_status`, `quality_flag`,
`event_type`, `tier`, `source`) is a plain string column with a
`CHECK` constraint, not a native Postgres `ENUM` type. Native enums
require `ALTER TYPE` outside a transaction to add a value later, which
Alembic handles awkwardly; a `CHECK` constraint is a normal DDL change
inside a normal migration.

Each allowed-value list is declared once as a Python tuple constant in
the model module and the `CHECK` constraint's SQL is generated from
that tuple's `repr()` (e.g. `f"gas_type IN {GAS_TYPES}"`), so the
Python-visible list of valid values and the constraint enforcing it in
the database can never drift apart into two different lists.

`permits.status` uses lowercase snake_case (`active`, `flagged`,
`suspend_recommended`, `closed`) for consistency with every other
enum column in the schema, resolving a naming mismatch between the
Technical Review's lowercase values and the Master Plan's uppercase
`VALID`/`FLAGGED`/`SUSPEND_RECOMMENDED` (the latter reads as display
labels, not committed to as a storage format anywhere).

## Timestamps

All datetime columns are timezone-aware (`TIMESTAMPTZ`). Only the
fields the frozen spec actually names per entity are included — there
is no blanket `created_at`/`updated_at` pair added to every table,
since none is specified and every table already has its own
domain-meaningful timestamp (`sensor_readings.timestamp`,
`permits.issued_at`/`expires_at`, etc.).

## Indexing philosophy

Indexes are added exactly where the frozen spec states them:
`sensor_readings` gets `(zone_id, timestamp DESC)` and
`(sensor_id, timestamp DESC)`; `permits` gets `(zone_id, status)` and
`(status, expires_at)`. No other column gets a speculative index in
M1 — if a later milestone's query pattern shows a real need on an
unindexed FK column, add the index then, with the migration that
introduces the query that needs it.

## Constraints beyond enums

`zone_adjacency` has a `CHECK (zone_id <> adjacent_zone_id)` — a zone
cannot be adjacent to itself. This is the one narrow constraint added
beyond what the spec states verbatim, because it encodes an invariant
the spec's own description already implies (adjacency is between two
distinct zones) rather than adding new validation the spec doesn't
call for.

## Migration philosophy

Alembic, hand-authored rather than autogenerated for the initial
migration — this sandbox has no live database to autogenerate
against, and hand-written DDL is the more reviewable artifact the
Master Plan's "autogenerate-reviewed-by-hand for every schema change"
philosophy is actually optimizing for. Revision IDs use a short
sequential slug (`0001_initial_schema`) rather than Alembic's default
random hash, purely for human readability — no other convention is
specified by the source documents.

Schema management is Alembic-only: nothing in the application calls
`Base.metadata.create_all()`. `alembic upgrade head` is the only way
the schema comes into existence.

## Seed idempotency

Repository `create()` methods use `Session.merge()`, not `Session.add()`.
Combined with deterministic UUIDs (`uuid.uuid5` over a fixed namespace
and each row's human-readable key in `tests/fixtures/demo_plant.json`),
re-running `seed.py` always resolves to the same primary keys and
`merge()` updates those rows in place instead of raising a duplicate-
key error — which is what "idempotent, safe to re-run" (M1's stated
completion criterion) requires.

## Repository scope

Repositories expose only what's needed today: a lookup method and
`create()` per entity, plus exactly the domain methods the Master Plan
names by example (`SensorReadingRepository.latest(zone_id, gas_type)`,
`ZoneAdjacencyRepository.adjacent_zone_ids(zone_id)` for M4's SIMOPS
check). No generic CRUD suite, no repository factory, no
unit-of-work abstraction, and no `audit_log` repository yet — M6 owns
its write logic (including hash chaining) and gets to design that
repository against real requirements instead of a guessed-at one from
M1. Later milestones extend a repository (as the Master Plan says M4
does to `permit_repository.py`) rather than M1 pre-building for them.
