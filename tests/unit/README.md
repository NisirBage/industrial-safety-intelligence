# Unit tests

Pure-function tests that mirror the `src/domain` structure — no I/O,
no database, no network.

`test_models_metadata.py` is the one exception: it imports
`src/infra/db/models` and checks table registration, which needs no
database connection, so it lives here rather than in `integration/`.
Otherwise empty until M2 (simulation), M3/M4 (agents), and M5
(orchestrator) land.
