# The Orchestrator's execution graph

Documentation only — describes `src/domain/orchestrator/scheduler.py`
(M5A) conceptually. See the module itself for the actual code, and
`docs/architecture/agent_pattern.md` / `docs/architecture/invariants.md`
for the agent-level rules this graph runs on top of.

## Execution levels

Three levels, not the "two-tier" language the Master Plan uses
informally — A.0's own dependency resolution states Worker Exposure
depends on both Gas Risk *and* Permit Intelligence's outputs, which a
two-level graph can't express:

- **Level 0** (parallel): Gas Risk, Equipment Status — no dependencies.
- **Level 1**: Permit Intelligence — depends on Gas Risk.
- **Level 2**: Worker Exposure — depends on Gas Risk *and* permit
  coverage information (see "upstream_results flow" below for why
  that second dependency doesn't travel through `upstream_results`).

## Dependency graph

Static and explicitly declared (`ExecutionPlan`/`ExecutionLevel`), not
discovered at runtime and not computed by a generic topological sort
— `build_default_execution_plan()` hardcodes the three levels above
for this project's four agents. Adding a fifth agent later means
writing a new explicit level assignment, not teaching the scheduler
to infer one.

## Scheduler responsibilities

`run_tick()` does exactly four things, in order, per level:
1. Invoke each level's agents concurrently (`asyncio.gather`).
2. Catch any agent's exception individually — one agent failing never
   aborts its level-mates or the tick as a whole.
3. Substitute a last-known-value-with-decay result for anything that
   failed (see "Cache lifecycle"), or raise if no such value exists.
4. Accumulate every level's results into a single per-tick results
   dict, passed forward to the next level.

The scheduler never imports a repository, never touches SimClock
directly (it receives `sim_time` as a parameter, the same rule every
agent already follows), and never computes a risk number itself —
fusion is explicitly out of this module's scope.

## Context builder responsibilities

Everything the scheduler doesn't do, a `ContextBuilder` does instead:
given `(zone_id, sim_time, tick_id, results_so_far)`, return one
agent's complete, ready-to-evaluate `AgentInput`. This is where real
repository queries will eventually live (a future services-layer
concern, not built in M5A) — the scheduler only ever calls whatever
builder it was handed, keeping `src/domain/orchestrator/` exactly as
I/O-free as `src/domain/agents/` already is.

## `upstream_results` flow

`results_so_far` — every result computed by *strictly earlier* levels
this tick — is what a builder uses to populate the agent's
`upstream_results`. This works cleanly for Permit Intelligence (Level
1 reads Gas Risk's real `AgentResult` from Level 0). It does **not**
work the same way for Worker Exposure's permit dependency: Worker
Exposure (M3D, frozen) was built before Permit Intelligence existed
and reads permit coverage via `AgentInput.context["permit_coverage"]`,
not `upstream_results`. A Level 2 context builder is expected to
derive that `PermitCoverage` fact from Permit Intelligence's Level-1
`AgentResult` and place it in `context`, not `upstream_results` — the
dependency is real, but it travels through a different channel than
the same-shape Gas Risk dependency does.

## Cache lifecycle

`AgentCache` holds only genuine successes, never a decayed
substitute. On success, `with_result()` returns a new cache with that
agent's entry replaced. On failure, the cache is **not** touched — it
keeps pointing at whatever the last real success was, however long
ago. This is deliberate: computing decay as `f(cached_result, now)`
fresh every time, from an always-genuine cached value, is what
prevents decay from compounding across consecutive failures. If an
agent has never once succeeded, there is nothing to decay from, and
the scheduler raises rather than fabricating a result.

## Deterministic execution guarantees

`run_tick(plan, zone_id, sim_time, tick_id, context_builders, previous_cache, config)`
reads no state that isn't one of its arguments, and returns
`(results, new_cache)` as ordinary values — nothing is mutated in
place, nothing is read from a global. The same call with the same
`previous_cache` always produces the same `results` and the same
`new_cache`, which is exactly what lets a golden-scenario regression
test (M5's own stated goal) replay a scenario and expect byte-for-byte
identical Orchestrator behavior, not just plausible behavior.
