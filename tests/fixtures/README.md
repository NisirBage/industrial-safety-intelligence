# Test fixtures

Seed data and mock scenario snippets shared across unit and
integration tests.

- `demo_plant.json` — the M1 demo plant: zones, zone adjacency,
  sensors, workers, equipment, a permit, and an incident. Consumed by
  both `src/infra/db/seed.py` (to populate a real database) and
  `tests/integration/test_db_constraints.py` (as test data), so the
  demo data and the test data can never drift apart into two copies.
