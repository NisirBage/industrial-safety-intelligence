"""Deterministic risk agents: Gas Risk, Equipment Status, Worker Exposure, Permit Intelligence.

``base.py`` (M3A) provides the shared contract every agent
implements: ``AgentInput``, ``AgentResult``, ``AgentMetadata``,
``Justification``, and the ``Agent`` protocol. The four concrete
agents themselves are still not implemented - that starts with M3B
(Gas Risk, Equipment Status, Worker Exposure) and M4 (Permit
Intelligence). No agent may use an LLM or untrained ML model to
produce a number that gates a safety action.
"""
