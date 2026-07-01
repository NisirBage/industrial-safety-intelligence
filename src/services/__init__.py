"""Use-case orchestration layer: wires domain logic and infra together per request.

Exists as the layer api/ calls into; services/ may import both domain/
and infra/. Populated starting M2 (``simulation_runner.py``, the only
place a scenario touches the database); M5 (``risk_pipeline.py``) and
M10 (``alerting.py``) still to come.
"""
