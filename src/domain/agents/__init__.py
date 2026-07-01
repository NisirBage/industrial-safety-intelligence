"""Deterministic risk agents: Gas Risk, Equipment Status, Worker Exposure, Permit Intelligence.

``base.py`` (M3A) provides the shared contract; ``gas_risk.py`` (M3B)
and ``equipment_status.py`` (M3C) are the first two concrete Tier-0
implementations. Worker Exposure is still pending, followed by M4's
Permit Intelligence. No agent may use an LLM or untrained ML model to
produce a number that gates a safety action.
"""
