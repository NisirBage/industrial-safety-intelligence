"""Historical Intelligence & Operational Memory (M24).

Separate from ``src/domain/`` by design: this package never scores,
tiers, fuses, schedules, replays, or simulates anything. It only reads
already-persisted ``RiskAssessment`` rows (via the same
``src/services/replay.py::build_replay`` the Time Machine already
uses) and already-authored scenario/incident metadata, then answers
one question - "what past incident does this look like, and what
happened then?" - using a deterministic feature vector and distance
metric, never a model. Every recommendation a user sees still comes
from the frozen engine; this package only ever supplies supporting
context (similar incidents, historical outcomes, lessons learned,
trend summaries) alongside it, never a recommendation of its own. See
``docs/architecture/historical_intelligence.md`` for the full design
rationale.
"""
