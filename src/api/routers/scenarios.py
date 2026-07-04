"""Scenario catalog REST router - ``GET /scenarios`` (Decision Intelligence Layer).

Read-only: lists ``scenarios/*.yaml`` via ``src/services/scenario_catalog.py``.
Never triggers a simulation run and never writes anything - the
scenario library shows *already-replayed, already-persisted* history
(see ``scripts/replay_scenarios.py`` and the project's own established
"replay via seed + run_scenario, then persist through the real
pipeline" workflow), not a live trigger.
"""

from fastapi import APIRouter

from src.api.common.errors import APIError, ErrorResponse
from src.api.schemas.scenarios import ScenarioSummaryResponse
from src.services.scenario_catalog import get_scenario_summary, load_catalog

router = APIRouter(prefix="/scenarios", tags=["scenarios"])


@router.get(
    "",
    response_model=list[ScenarioSummaryResponse],
    summary="List every authored scenario, earliest incident first",
    description="Reads scenarios/*.yaml on every call (there are only a handful of small "
    "files) - always reflects what's actually on disk, never a stale cache.",
)
def list_scenarios() -> list[ScenarioSummaryResponse]:
    return [ScenarioSummaryResponse.model_validate(vars(s)) for s in load_catalog()]


@router.get(
    "/{key}",
    response_model=ScenarioSummaryResponse,
    summary="One scenario's metadata by its file stem",
    responses={404: {"model": ErrorResponse, "description": "No scenario with this key."}},
)
def get_scenario(key: str) -> ScenarioSummaryResponse:
    summary = get_scenario_summary(key)
    if summary is None:
        raise APIError(status_code=404, code="SCENARIO_NOT_FOUND", message=f"No scenario {key!r}")
    return ScenarioSummaryResponse.model_validate(vars(summary))
