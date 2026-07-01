"""Everything that talks to the outside world: databases, vector
stores, and LLM/notification/CV clients.

Exists as the layer domain/ must never import from and services/ is
allowed to import from. Empty in M0. Populated incrementally starting
M1 (db).
"""
