"""M27 Part 4 (Live Data Connectors) - alternate producers of the same
`sensor_readings` rows `src/domain/simulation/generator.py` (via
`src/services/simulation_runner.py`) already writes. Every connector
here - real or mocked - funnels through `service.ingest_reading()`,
which does nothing but assemble a `SensorReading` from an existing
`Sensor`'s own real metadata and write it through the existing
`SensorReadingRepository`. It computes no risk, tier, or confidence:
the deterministic engine picks up a newly-ingested reading naturally
on its own next scheduled tick, exactly as it already does for
simulated data. Nothing in this package imports or modifies anything
under `src/domain/agents`, `src/domain/orchestrator`, or
`src/domain/simulation`.
"""
