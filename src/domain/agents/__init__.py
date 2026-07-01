"""Deterministic risk agents: Gas Risk, Equipment Status, Worker Exposure, Permit Intelligence.

``base.py`` (M3A) provides the shared contract; ``gas_risk.py`` (M3B)
is the first concrete implementation. Equipment Status and Worker
Exposure are still pending, followed by M4's Permit Intelligence. No
agent may use an LLM or untrained ML model to produce a number that
gates a safety action.
"""
