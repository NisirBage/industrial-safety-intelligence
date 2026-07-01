# The deterministic agent pattern

Documentation only — describes the architectural pattern now
validated three times over (Gas Risk, Equipment Status, Worker
Exposure) rather than any one agent's specific math. See
`docs/algorithms/*.md` for each agent's actual formulas.

## Agent responsibilities

Each agent answers exactly one question for one zone, one tick: *how
risky is this specific dimension right now, and how confident am I?*
Nothing more. An agent never:

- talks to a database, a repository, or a session (`src/domain/` has
  zero I/O, enforced structurally — the folder contains no import
  path to `src/infra/`);
- calls a wall-clock API (enforced by
  `tests/unit/test_no_wallclock_calls.py`'s AST scan over all of
  `src/domain`);
- instantiates or invokes another agent directly. Cross-agent data
  flows exactly one way: through `AgentInput.upstream_results`,
  populated by whatever scheduler runs the agents in order (M5's job,
  not any agent's). Worker Exposure reading
  `upstream_results["gas_risk"]` is the only example of this so far,
  and it never imports `GasRiskAgent` to get there.
- knows what tier it belongs to, or how many tiers exist. Tier
  thresholds (WATCH/ELEVATED/CRITICAL) appear only as each agent's
  *own*, independently-configured copy, used to weight its own
  contribution — never as a shared constant imported from another
  agent or a not-yet-built Orchestrator module.

Everything an agent needs beyond `zone_id`/`sim_time`/`upstream_results`
arrives via `AgentInput.context`, a generic `Mapping[str, object]`
populated by whichever caller assembles it. No agent has ever needed
to guess at another agent's data shape before that agent existed —
Worker Exposure's `PermitCoverage` is deliberately decoupled from
Permit Intelligence's not-yet-designed output for exactly this reason.

## Deterministic helper pipeline

Every agent factors its logic into small, named, pure functions
(`calculate_risk`, `calculate_confidence`, plus one or more
domain-specific helpers) and one `build_justification` that turns
their outputs into an explanation. "Pure" means: no I/O, no
randomness, no hidden state — same arguments in, same values out,
every time. This is what makes `evaluate()` itself almost trivial:
it extracts values from `context`, calls the helpers in sequence, and
assembles the result.

The helper *count* is not sacred — Worker Exposure has five, not
four, because its domain has two genuinely independent outputs
(exposure risk and an unauthorized-worker list) that would otherwise
force testing real domain logic only through justification-string
assertions. What's load-bearing is the *shape*: small, single-purpose,
independently testable functions, not a fixed number.

## The `AgentResult` contract

Every agent returns the same four things, regardless of domain:

- `risk: float` — always on a common 0–100 scale, always via the same
  saturating family (`100 × (1 − e^(−k × x))`) so agent outputs stay
  comparable to each other for whatever the Orchestrator's fusion
  step (M5) eventually does with them. Each agent's `k` (and whatever
  `x` means in its own domain — a reading/threshold ratio, a degraded
  ratio, a tier-weighted headcount) is its own, independently derived
  configuration value, never imported from another agent.
- `confidence: float` — 0–1, never a shortcut for the risk value
  itself. Confidence answers a different question ("how much should
  this number be trusted") from risk ("how bad is it").
- `justification` — every agent explains itself, not just scores
  itself. See Explainability below.
- `schema_version` — reserved for future serialization compatibility,
  present from the first agent (M3B) onward.

## Configuration philosophy

Every tunable constant lives in a frozen, immutable dataclass
(`GasRiskConfig`, `EquipmentStatusConfig`, `WorkerExposureConfig`),
constructed once and held as the *only* state an agent instance
retains between evaluations — agents are otherwise stateless with
respect to simulation data. No constant is ever shared or imported
between agents, even when two agents derive the identical number the
same way (both Gas Risk's and Equipment Status's `steepness_k` equal
`2·ln(2)`, independently derived, independently declared). This
isn't duplication for its own sake — it means changing one agent's
tuning can never silently change another's.

Every default value is labeled as either **cited** (traceable to a
specific number or constraint in the source specification) or
**proposed** (this project's own reasonable placeholder, flagged as
such, not presented as authoritative). Nothing is asserted as "the
spec says X" unless it actually does.

## Confidence philosophy

The one universal rule: confidence is never fabricated to look better
than the underlying information warrants, and it's combined via
**minimum**, not average, across independent sub-scores where an
agent has more than one (Gas Risk's freshness/calibration/history
triple) — the worst factor gates the whole score, so two good signals
can never mask one bad one.

Beyond that rule, each agent's actual confidence *behavior* is
domain-specific and deliberately not standardized further — seeing
three different, well-justified approaches emerge independently was a
sign the pattern was flexible enough, not a gap to close.

## Explainability philosophy

Every agent's `justification.evidence` contains enough raw numbers
that a human — or a future UI panel — can re-derive the reported risk
by hand, without reading source code. This is checked directly in
tests (hand-computed exact values like `risk == 50.0` at a formula's
documented midpoint), not just asserted in prose. `rules_fired`
labels which path was taken (normal, or one of the agent's degraded-
data cases) so a log line or an audit entry can say *why* a number
looks the way it does, not just *what* the number is.

## Testing philosophy

Three complementary layers, present in every agent's test suite:

1. **Exact hand-computed values** at formula-defining points (e.g.
   `risk == 50.0` where the steepness constant was derived to make
   that true) — these catch a wrong formula, not just a plausible one.
2. **Mathematical invariants**, not just examples: monotonicity
   (more of the bad thing never produces less risk), confidence
   bounds and ordering, bounded risk (0–100) — introduced explicitly
   starting with Equipment Status (M3C) and continued since.
3. **Degraded-data and genuine-failure cases**, tested independently
   of each other: missing data, stale data, insufficient information,
   and a real exception (never silently swallowed) each get their own
   test, because each is a different code path with a different
   justification.

All three layers run without a database — every agent's test suite is
pure, deterministic, and fast, which is a direct consequence of the
zero-I/O rule above, not a separate testing decision.

## What this pattern has proven across three agents

Gas Risk, Equipment Status, and Worker Exposure each needed genuinely
different domain logic — a physical saturating curve with staleness
decay, a common-cause-aware grouping heuristic, and a tier-weighted
headcount consuming another agent's output — and none of them
required a change to `src/domain/agents/base.py` (M3A, frozen since
its own milestone) to fit. That's the actual evidence the pattern is
sound: not that it was designed well up front, but that three
unrelated domains landed in it without bending it.
