"""Deterministic risk agents: Gas Risk, Equipment Status, Worker Exposure, Permit Intelligence.

``base.py`` (M3A) provides the shared contract. All three Tier-0
agents are implemented: ``gas_risk.py`` (M3B), ``equipment_status.py``
(M3C), ``worker_exposure.py`` (M3D). ``permit_intelligence.py``
currently holds only the Tier-1 Permit Reasoning Framework (M4A) -
representations, policy, and pure decision helpers, not yet a
complete agent; the state-machine logic and ``Agent`` protocol
implementation are M4B. No agent may use an LLM or untrained ML model
to produce a number that gates a safety action.
"""
