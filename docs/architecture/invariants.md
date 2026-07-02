# Architectural invariants

Documentation only. These are the rules the deterministic reasoning
layer (M3A–M4B) has held without exception across four agents and
five milestones — not aspirations, but properties every existing test
suite already checks for. Anything added later (M5's Orchestrator
onward) is expected to preserve these, not renegotiate them.

## Deterministic execution

Same input, same output, every time. No agent, helper, or repository
method consults anything outside its explicit arguments to produce a
result — no random number generation without an explicit, scenario-
supplied seed (M2), no reliance on process-global state. This is what
makes every agent's test suite exact-value-checkable (`risk == 50.0`
at a documented formula midpoint) rather than merely
plausibility-checked.

## Stateless agents

An agent instance retains exactly one thing between evaluations: its
own immutable configuration object (`GasRiskConfig`,
`EquipmentStatusConfig`, `WorkerExposureConfig`,
`PermitReasoningConfig`). No agent accumulates simulation data,
history, or counters on `self` — anything resembling "memory" (a
rolling reading window, a permit's baseline snapshot) is either
recomputed from `AgentInput.context` each call or persisted
externally, never held on the instance.

## No business logic in repositories

Repositories (`src/infra/db/repositories/`) expose typed, narrow
methods — lookups, `create()`, and now `PermitRepository.update_status()`
— and contain no decision logic. `update_status()` is deliberately
minimal: it changes one column and returns, precisely so it cannot
become a place where reasoning accidentally leaks into
persistence. Every decision (what a permit's status *should* become,
what a zone's risk *is*) is computed in `src/domain/`, which has zero
I/O and cannot reach a repository even by accident — the folder
structure itself makes the violation impossible, not just discouraged.

## Immutable baseline snapshots

`permits.baseline_snapshot` is written once, at issuance, and never
mutated afterward — only compared against. `PermitRepository.update_status()`
enforces this structurally: it mutates the fetched ORM instance's
`status` attribute directly rather than reconstructing or merging a
whole object, so no code path through that method can touch
`baseline_snapshot` even by mistake. `PermitBaselineSnapshot` (the
domain-layer representation) carries its own `algorithm_version`,
separate from the live `PermitReasoningConfig.algorithm_version`,
specifically so a snapshot remains able to say which version of the
reasoning module originally produced its numbers, even after the
live config has since changed.

## Conservative confidence propagation

Confidence is combined via **minimum**, never averaged, across every
independent factor an agent has — Gas Risk's freshness/calibration/
history triple, Permit Intelligence's own confidence *and* the
upstream Gas Risk agent's confidence. The worst factor always gates
the whole score, so two good signals can never mask one bad one. Four
agents have each applied this identically, to different factor sets,
without exception.

Degraded or missing data is never silently assumed safe. Each agent's
specific failure philosophy differs by domain (Gas Risk fabricates a
conservative elevated *risk number*; Equipment Status reports an
honest *zero count*; Worker Exposure assumes a conservative *non-zero
headcount floor*; Permit Intelligence's fail-open-never rule escalates
rather than defaulting to `active`) — but every one of them moves
toward the conservative extreme on missing information, never the
convenient one.

## Escalation-only recommendation policy

Once established by Permit Intelligence (M4B): a recommendation can
move toward greater severity based on new findings, but can never
automatically move back toward less severity. Reversing an escalation
requires an explicit action outside the reasoning layer — no agent
computes de-escalation, by design, not by omission.

## No wall-clock usage

No code in `src/domain/` or `src/services/` calls `datetime.now()`,
`datetime.utcnow()`, or `time.time()` — enforced automatically by an
AST scan (`tests/unit/test_no_wallclock_calls.py`, introduced in M2)
that runs against the entire package tree, not a fixed file list. It
has required zero changes as new agents were added, because "current
time" always arrives as `AgentInput.sim_time`, an ordinary input
field, never a clock reference.

## Explainability requirements

Every agent returns a `Justification` carrying a plain-English
`summary`, a list of `rules_fired` naming exactly which path was
taken, and an `evidence` dict with enough raw numbers to re-derive the
reported risk by hand — checked directly in tests via hand-computed
exact values, not just asserted in prose. This has held across four
domains with different underlying math (a physical saturating curve,
a common-cause-grouped count, a tier-weighted headcount, a categorical
state machine) without needing a different explainability mechanism
for any of them.
