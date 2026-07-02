# Architecture decision index

Documentation only — an index, not a rewrite. Each entry links to the
full ADR under `docs/adr/`; nothing here supersedes what that document
says.

| ADR | Title | Rationale (one line) | Affected modules | Status |
|---|---|---|---|---|
| [0001](../adr/0001-incidents-embedding-storage.md) | Incidents table holds no vector column; embeddings live only in Chroma | Avoids an unplanned pgvector extension and a two-sources-of-truth split between Postgres and Chroma for the same embedding | `src/infra/db/models/incident.py` (M1); Chroma-backed retrieval (M11, not yet built) | Accepted |

## Decisions recorded outside the ADR process

Not every architectural decision made across M0–M5 was written as a
formal ADR — most were resolved as explicit, user-approved
clarifications during each milestone's Phase 0 planning step, then
recorded permanently in that milestone's own algorithm or architecture
document rather than a standalone ADR. This index does not retroactively
convert them into ADRs (out of scope for this milestone — see the
Architecture Freeze Engineering Report); it points to where each
already lives:

- Three-level (not two-level) agent execution graph —
  `docs/architecture/execution_graph.md`.
- Minimum-based (never averaged) confidence aggregation, project-wide —
  `docs/architecture/invariants.md`, `docs/architecture/mathematical_model.md`.
- Escalation-only permit recommendation policy —
  `docs/architecture/invariants.md`, `docs/algorithms/permit_intelligence.md`.
- Last-known-value-with-accelerated-decay agent failure handling
  (never exclusion, never fabrication) — `docs/architecture/execution_graph.md`.
- Dedicated, per-module domain types instead of shared/reused types
  even where structurally similar (`GasReading`, `EquipmentRecord`,
  `PermitCoverage`, `CounterfactualReading`, `RiskAssessmentJustification`) —
  `docs/architecture/agent_pattern.md`.
- Counterfactual Comparator's deliberate zero-code-sharing independence
  from the compound engine — `docs/algorithms/counterfactual.md`.

## Recommendation

No consolidation action needed at this time: one formal ADR exists,
it remains accurate, and the informal-decision record above is not
missing anything that would need a retroactive ADR to stay
traceable. If a future milestone reverses or replaces any of the
decisions listed above, that reversal should get a proper ADR — the
informal record works for a decision that has held unchanged, not for
one being changed.
