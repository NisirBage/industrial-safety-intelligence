"""Deterministic risk agents: Gas Risk, Equipment Status, Worker Exposure, Permit Intelligence.

``base.py`` (M3A) provides the shared contract. All three Tier-0
agents are now implemented: ``gas_risk.py`` (M3B), ``equipment_status.py``
(M3C), and ``worker_exposure.py`` (M3D) - the last of which is also
the first agent to actually consume another agent's output, via
``upstream_results["gas_risk"]``, rather than being independently
testable in isolation. M4's Permit Intelligence (Tier-1) is next. No
agent may use an LLM or untrained ML model to produce a number that
gates a safety action.
"""
