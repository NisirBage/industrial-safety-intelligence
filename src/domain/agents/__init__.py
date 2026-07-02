"""Deterministic risk agents: Gas Risk, Equipment Status, Worker Exposure, Permit Intelligence.

``base.py`` (M3A) provides the shared contract. All four agents are
now complete: the three Tier-0 agents (``gas_risk.py`` M3B,
``equipment_status.py`` M3C, ``worker_exposure.py`` M3D) and the
Tier-1 ``permit_intelligence.py`` (representations/policy in M4A,
the full ``PermitIntelligenceAgent`` state machine in M4B) - the
first agent whose confidence depends on another agent's confidence,
not just its risk. The Orchestrator/Compound Risk Engine (M5) is
next. No agent may use an LLM or untrained ML model to produce a
number that gates a safety action.
"""
