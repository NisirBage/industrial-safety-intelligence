"""Shared agent contract: AgentInput, AgentResult, AgentMetadata,
Justification, and the Agent protocol.

Exists as the one interface every future agent (Gas Risk, Equipment
Status, Worker Exposure, Permit Intelligence, and whatever M12 adds)
implements, so the Orchestrator (M5) can treat every agent
interchangeably regardless of its internal logic - this is the
concrete resolution of A.6 the Master Plan names, and the file M3's
own task 1 lists as its only deliverable.

Deliberately tier-agnostic: nothing here encodes which agents run in
which order or how many tiers exist - that's M5's scheduler.py's job
(M3A clarification 1). Deliberately I/O-agnostic on the data side
too: AgentInput.context carries whatever raw data a specific agent
needs, populated by whichever services-layer caller constructs it
(M5/M6), so this module never imports a repository or session type.
"""

from __future__ import annotations

import uuid
from collections.abc import Mapping
from dataclasses import dataclass, field
from datetime import datetime
from typing import Protocol, runtime_checkable


@dataclass(frozen=True)
class AgentMetadata:
    """Stable, runtime-independent descriptive information about an agent.

    Exists so callers (logging, the Orchestrator, an explainability
    UI) can identify and describe an agent without invoking it - one
    mechanism serving both the "stable name identifier" and "metadata
    descriptor" needs (M3A clarifications 2 and 11), rather than two
    separate, overlapping ones.
    """

    name: str
    description: str = ""


@dataclass(frozen=True)
class Justification:
    """An agent's own explanation for its own result.

    Not the Orchestrator's downstream, post-fusion justification
    shape - that one is frozen separately (src/infra/db/models/risk_assessment.py,
    per M1/A.4) and aggregates every agent's contribution after
    fusion. This one is per-agent, pre-fusion. ``evidence`` is
    optional supporting detail (e.g. the specific readings a rule
    fired against) beyond the required summary and rule list.
    """

    summary: str
    rules_fired: list[str] = field(default_factory=list)
    evidence: dict[str, object] | None = None


@dataclass(frozen=True)
class AgentInput:
    """Everything an agent needs for one evaluation, and nothing it should fetch for itself.

    Agents never call a repository or a clock directly - domain code
    has zero I/O (src/domain/__init__.py) and never touches a
    wall-clock API (src/domain/simulation/clock.py's rule, enforced
    for this whole package too by tests/unit/test_no_wallclock_calls.py).
    ``tick_id`` exists so an agent's own log lines can carry the
    correlation field src/config/logging.py's convention requires.
    ``upstream_results`` is a generic, tier-agnostic mapping keyed by
    agent name - populated with whatever's already been computed
    this tick, regardless of how many tiers the scheduler ends up
    using.
    """

    zone_id: uuid.UUID
    sim_time: datetime
    tick_id: int
    upstream_results: Mapping[str, AgentResult] = field(default_factory=dict)
    context: Mapping[str, object] = field(default_factory=dict)


@dataclass(frozen=True)
class AgentResult:
    """An agent's output for one zone, one tick.

    ``schema_version`` exists so a future serialization change (e.g.
    persisting these directly, or streaming them over the M7
    WebSocket layer) has a field to key compatibility logic off,
    without this dataclass needing to guess now what that logic looks
    like (M3A clarification 3).
    """

    agent_name: str
    risk: float
    confidence: float
    justification: Justification
    computed_at: datetime
    schema_version: int = 1


@runtime_checkable
class Agent(Protocol):
    """The contract every risk agent implements.

    No lifecycle hooks (initialize/shutdown/before_tick/after_tick) -
    none is justified by a concrete requirement yet (M3A clarification
    10); add one only when a real milestone needs it.

    Error handling contract: domain uncertainty (stale/missing data)
    is reported as a conservative AgentResult - elevated risk, low
    confidence, per Technical Review Section 4.7 - never an exception.
    A genuine failure must propagate as a real exception; catching and
    silently downgrading it to a "safe" result would hide the failure
    from the Orchestrator, which is itself an "assume safe" failure
    mode this project explicitly rejects (M3A clarification 8).

    State: implementations must be stateless with respect to
    simulation data - only immutable configuration (e.g. a tuned
    constant) may be retained on the instance between evaluations
    (M3A clarification 6). ``metadata`` is exactly that kind of
    immutable configuration, not simulation state.
    """

    metadata: AgentMetadata

    async def evaluate(self, input: AgentInput) -> AgentResult: ...
