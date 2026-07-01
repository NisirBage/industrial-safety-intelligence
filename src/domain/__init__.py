"""Pure domain logic: zero I/O, zero framework imports, zero references to infra/ or api/.

Exists as the innermost layer of the dependency chain so the
deterministic Compound Risk Engine and its agents are structurally
incapable of importing a database session or an LLM client - the
folder simply contains no such import path. Empty in M0; populated
starting M2 (simulation), M3-M4 (agents), M5 (orchestrator).
"""
