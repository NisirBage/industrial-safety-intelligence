"""Use-case orchestration layer: wires domain logic and infra together per request.

Exists as the layer api/ calls into; services/ may import both domain/
and infra/. Empty in M0 ("zero business logic"). Populated starting
M2 (simulation_runner), M5 (risk_pipeline), M10 (alerting).
"""
