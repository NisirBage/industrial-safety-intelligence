"""Operational Knowledge Graph (M26).

NOT a reasoning engine. This package computes nothing: it never
modifies a risk score, tier, fusion result, forecast, historical
match, recommendation, or counterfactual verdict. It only reads
entities that already exist elsewhere in this platform - real
database rows (`src/infra/db/models`), real historical incidents
(`src/historical/`), real forecasts (`src/foresight/`), and the real,
unmodified counterfactual comparator
(`src/domain/orchestrator/counterfactual.py::evaluate`) - and connects
them into a navigable graph structure so a judge (or any user) can
click any entity and see what it is, what it influences, what
influences it, and what evidence exists.

Every `GraphEntity.attributes` value is copied verbatim from an
already-computed field on a real row or dataclass - never a new
derivation. Where a node's real "content" is itself a piece of
frontend-only presentation logic (e.g. a Recommendation's exact
wording, from `frontend/src/lib/recommendations.ts`), this package
mirrors only the frozen *lookup table* those functions already use
(the same way `Tier`/`RISK_TIERS`/agent-name strings are already
mirrored across the Python backend and the TypeScript frontend
throughout this codebase) - never a second implementation of a
decision.

Package layout:
- `entities.py` - `GraphEntity`, `EntityKind` constants, id helpers.
- `relationships.py` - `GraphEdge`, `RelationKind` constants, the
  documented relationship table (Part 2).
- `recommendation_text.py` - a verbatim mirror of
  `frontend/src/lib/recommendations.ts`'s two frozen lookup
  constants, used only so the graph can enumerate real
  Recommendation nodes without re-implementing that logic.
- `builders.py` - one pure function per entity kind, each converting
  an already-fetched real row/dataclass into a `GraphEntity`.
- `service.py` - `GraphService`: entity lookup, neighborhood
  expansion, subgraph generation, search, shortest-path - all
  read-only, all built from existing repositories/services.
"""
