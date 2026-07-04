"""Scenario Builder REST router - this platform's first write (POST)
endpoints.

``/options`` is read-only reference data (frozen curve/permit/gas-type
constants, echoed so the frontend never hardcodes a second copy).
``/validate`` is a dry run: it never writes, it only reuses the frozen
``validate_structure`` plus this milestone's own reference checks
(``src/services/scenario_builder.py``). ``/execute`` is the first
endpoint in this API that persists anything - it builds sensor
readings/permits and runs them through the unmodified, existing risk
pipeline (``run_zone_tick``), exactly the sequence every pre-authored
scenario already goes through, just assembled from a user's choices
instead of a YAML file. See ``docs/architecture/CORE_FREEZE.md``'s
Architecture Impact Assessment for this milestone: zero changes to
``src/domain/``.
"""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from src.api.dependencies import get_db_session
from src.api.schemas.scenario_builder import (
    CurveInfo,
    ScenarioBuilderOptionsResponse,
    ScenarioDefinitionInput,
    ScenarioExecutionResponse,
    ScenarioValidationResponse,
    ZoneScenarioResultResponse,
)
from src.domain.simulation.curves import CURVE_REGISTRY, CURVE_REQUIRED_PARAMS
from src.domain.simulation.scenario import Scenario
from src.infra.db.models.permit import PERMIT_TYPES
from src.infra.db.models.sensor import GAS_TYPES
from src.services.scenario_builder import (
    PermitEventSpec,
    SensorEventSpec,
    build_scenario,
    execute_builder_scenario,
    validate_builder_scenario,
)

router = APIRouter(prefix="/scenario-builder", tags=["scenario-builder"])


def _build_scenario(payload: ScenarioDefinitionInput) -> Scenario:
    return build_scenario(
        seed=payload.seed,
        start_time=payload.start_time,
        sensor_events=[
            SensorEventSpec(
                name=e.name,
                zone_id=e.zone_id,
                gas_type=e.gas_type,
                sim_time=e.sim_time,
                duration_minutes=e.duration_minutes,
                curve=e.curve,
                params=e.params,
                sample_interval_minutes=e.sample_interval_minutes,
            )
            for e in payload.sensor_events
        ],
        permit_events=[
            PermitEventSpec(
                name=e.name,
                zone_id=e.zone_id,
                sim_time=e.sim_time,
                permit_type=e.permit_type,
                authorizing_officer_id=e.authorizing_officer_id,
                duration_minutes=e.duration_minutes,
            )
            for e in payload.permit_events
        ],
    )


@router.get(
    "/options",
    response_model=ScenarioBuilderOptionsResponse,
    summary="Reference data for the Scenario Builder UI",
    description="Curve types + required params, permit types, and gas types - every value "
    "read directly from the frozen CURVE_REGISTRY/CURVE_REQUIRED_PARAMS and the "
    "PERMIT_TYPES/GAS_TYPES model-level enums, never a second hardcoded copy.",
)
def get_builder_options() -> ScenarioBuilderOptionsResponse:
    return ScenarioBuilderOptionsResponse(
        curves=[
            CurveInfo(name=name, required_params=list(CURVE_REQUIRED_PARAMS[name]))
            for name in sorted(CURVE_REGISTRY)
        ],
        permit_types=list(PERMIT_TYPES),
        gas_types=list(GAS_TYPES),
    )


@router.post(
    "/validate",
    response_model=ScenarioValidationResponse,
    summary="Validate a builder-authored scenario (dry run, no writes)",
    description="Reuses the frozen validate_structure() unchanged, plus reference checks "
    "(zone/sensor/worker existence, negative-concentration detection) that live entirely "
    "in src/services/ (not frozen). Never persists anything.",
)
def validate_scenario_definition(
    payload: ScenarioDefinitionInput, session: Session = Depends(get_db_session)
) -> ScenarioValidationResponse:
    scenario = _build_scenario(payload)
    errors = validate_builder_scenario(scenario, session)
    return ScenarioValidationResponse(valid=not errors, errors=errors)


@router.post(
    "/execute",
    response_model=ScenarioExecutionResponse,
    summary="Execute a builder-authored scenario through the existing pipeline",
    description="Persists sensor readings/permits (reusing the frozen generate_sensor_"
    "readings/generate_permits) then runs every reading through run_zone_tick (unchanged) "
    "- the same tick-by-tick driver every pre-authored scenario replay already uses. "
    "Ephemeral: this run is not saved as a scenarios/*.yaml file and never appears in the "
    "Scenario Library catalog. Returns validation errors instead of executing if the "
    "scenario is invalid.",
)
async def execute_scenario_definition(
    payload: ScenarioDefinitionInput,
) -> ScenarioExecutionResponse:
    scenario = _build_scenario(payload)
    result = await execute_builder_scenario(scenario)
    return ScenarioExecutionResponse(
        valid=result.valid,
        errors=result.errors,
        start_time=result.start_time,
        end_time=result.end_time,
        zone_results=[
            ZoneScenarioResultResponse(
                zone_id=r.zone_id,
                tick_count=r.tick_count,
                final_tier=r.final_tier,
                final_score=r.final_score,
                assessment_ids=r.assessment_ids,
            )
            for r in result.zone_results
        ],
    )
