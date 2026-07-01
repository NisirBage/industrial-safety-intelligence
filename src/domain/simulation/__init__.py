"""SimClock, scenario schema, and synthetic curve generators.

Populated in M2: ``clock.py`` (SimClock), ``curves.py`` (the three
pure curve generators), ``scenario.py`` (schema, YAML loader,
structural validation), ``generator.py`` (pure event-sequence
generation), and ``ids.py`` (deterministic UUID resolution shared
with M1's seed script). Everything here is pure/no-I/O by design, so
M3's agents and M5's orchestrator can use it as test fixture data
without touching a database.
"""
