"""Pydantic response schemas - one module per resource, mirroring
``src/api/routers/``. Every schema maps directly from an ORM row via
``model_config = ConfigDict(from_attributes=True)``; none recomputes
or reshapes a value the deterministic engine or a repository didn't
already produce.
"""
