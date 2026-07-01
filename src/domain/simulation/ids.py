"""Deterministic id resolution shared between seed data (M1) and scenario data (M2).

Exists so a human-readable key like ``"zone-tank-farm"`` always
resolves to the same UUID whether it's used by
``src/infra/db/seed.py`` to insert the demo plant or by a scenario
file (M2) to reference it - the approved deterministic-UUID strategy
only works end to end if both sides hash the same namespace. This is
pure computation with no I/O, so it belongs in ``domain/`` rather
than ``infra/``; ``infra/db/seed.py`` imports it from here (infra may
depend on domain; domain depends on nothing outside itself).

``src/domain/simulation/generator.py`` and ``src/services/simulation_runner.py``
both depend on this for resolving scenario references and for
deriving deterministic reading/permit ids.
"""

import uuid

SEED_NAMESPACE = uuid.UUID("8f14e45f-ceea-4a3d-8b0f-49b1f6a0c1a1")


def resolve_id(key: str) -> uuid.UUID:
    """Resolve a human-readable fixture/scenario key to a deterministic UUID."""
    return uuid.uuid5(SEED_NAMESPACE, key)
