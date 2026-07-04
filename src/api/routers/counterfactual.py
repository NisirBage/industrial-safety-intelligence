"""Counterfactual comparison REST router (Decision Intelligence Layer).

Orchestrates only, and computes nothing of its own: discovers which
gas type(s) a zone monitors (``SensorRepository.list_by_zone``),
assembles the frozen Counterfactual Comparator's own input
(``build_counterfactual_readings``, unchanged computation, just given
a historical ``as_of`` instead of "latest"), and calls the frozen
``evaluate()`` directly - the exact same function
``src/services/risk_pipeline.py`` calls on every live tick. Nothing
here is persisted; this is a pure, on-demand, read-only recomputation
of an independent, already-frozen algorithm's output, not a new
model.

An unknown ``zone_id`` behaves like every other zone-scoped read
endpoint in this API (``GET /risk/history/{zone_id}``): no readings
found, no error - Counterfactual's own frozen behavior for missing
data is "no alert," not a failure.
"""

import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from src.api.dependencies import get_db_session
from src.api.schemas.counterfactual import (
    CompoundVerdict,
    CounterfactualComparisonResponse,
    CounterfactualVerdict,
)
from src.domain.orchestrator.counterfactual import evaluate as evaluate_counterfactual
from src.infra.db.repositories import RiskAssessmentRepository, SensorRepository
from src.services.context_builders import build_counterfactual_readings

router = APIRouter(prefix="/counterfactual", tags=["counterfactual"])


@router.get(
    "/{zone_id}",
    response_model=CounterfactualComparisonResponse,
    summary="Naive single-sensor-threshold verdict vs. the compound engine, for one zone/tick",
    description="Recomputes the frozen Counterfactual Comparator's independent verdict "
    "on demand from persisted sensor readings as of `timestamp`, and pairs it with the "
    "compound engine's own persisted verdict for that exact tick if one exists. Nothing is "
    "written; nothing is recomputed except the already-frozen, independent Counterfactual "
    "function itself.",
)
def get_counterfactual_comparison(
    zone_id: uuid.UUID,
    timestamp: datetime = Query(..., description="The tick to evaluate, ISO 8601."),
    session: Session = Depends(get_db_session),
) -> CounterfactualComparisonResponse:
    gas_types = [sensor.gas_type for sensor in SensorRepository(session).list_by_zone(zone_id)]
    readings = build_counterfactual_readings(zone_id, gas_types, session, as_of=timestamp)
    result = evaluate_counterfactual(zone_id, timestamp, readings)

    compound_row = RiskAssessmentRepository(session).get_by_zone_and_timestamp(zone_id, timestamp)
    compound = (
        CompoundVerdict(
            compound_risk_score=compound_row.compound_risk_score,
            confidence=compound_row.confidence,
            tier=compound_row.tier,
        )
        if compound_row is not None
        else None
    )

    return CounterfactualComparisonResponse(
        zone_id=zone_id,
        timestamp=timestamp,
        counterfactual=CounterfactualVerdict(
            alert=result.alert,
            triggered_sensors=result.triggered_sensors,
            highest_ratio=result.highest_ratio,
        ),
        compound=compound,
    )
