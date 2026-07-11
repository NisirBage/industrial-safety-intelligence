"""Historical Intelligence REST router - M24.

Read-only, same as every other router in this API: orchestrates a call
into `src/historical/*` and shapes the response. Never runs a
scenario, never writes anything, never recomputes risk - every value
returned is either static authored metadata (`decks.py`) or a
deterministic derivation over already-persisted `RiskAssessment` rows
(`knowledge_base.py`, `analytics.py`).

Per this milestone's explicit architectural principle: this router
never returns a recommendation of its own. `/historical/matches`
returns *context* about similar past incidents (matched features,
lessons learned, real outcomes) - the deterministic engine's own
`GET /risk/current`/`/risk/history/{zone_id}` remain the only source
of an operational recommendation.
"""

import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from src.api.common.errors import APIError, ErrorResponse
from src.api.dependencies import get_db_session
from src.api.schemas.historical import (
    CrossScenarioAnalyticsResponse,
    HistoricalDeckResponse,
    HistoricalIncidentSummary,
    IncidentMatchesResponse,
    IncidentMatchResponse,
    LessonResponse,
    RuleFrequencyResponse,
    UnavailableResponse,
)
from src.historical.analytics import compute_analytics
from src.historical.decks import HISTORICAL_DECKS
from src.historical.knowledge_base import find_similar_incidents
from src.infra.db.repositories import RiskAssessmentRepository

router = APIRouter(prefix="/historical", tags=["historical"])

_MAX_TOP_N = 20


@router.get(
    "/decks",
    response_model=list[HistoricalDeckResponse],
    summary="List every Historical Intelligence deck",
    description="Every deck this platform has real incident data for. See "
    "src/historical/decks.py for why this is one honest deck, not fabricated "
    "industry-labeled decks.",
)
def list_decks() -> list[HistoricalDeckResponse]:
    return [
        HistoricalDeckResponse(
            key=deck.key,
            name=deck.name,
            description=deck.description,
            incidents=[
                HistoricalIncidentSummary(
                    scenario_key=incident.scenario_key,
                    root_cause=incident.root_cause,
                    business_impact=incident.business_impact,
                    operational_impact=incident.operational_impact,
                    safety_impact=incident.safety_impact,
                )
                for incident in deck.incidents
            ],
        )
        for deck in HISTORICAL_DECKS
    ]


@router.get(
    "/matches",
    response_model=IncidentMatchesResponse,
    summary="Top historical incident matches for one zone/tick",
    description="Given a zone and an exact persisted assessment timestamp, returns the "
    "most similar historical incidents (deterministic weighted-distance similarity - no "
    "LLM, no embeddings). Never a recommendation of its own - context only.",
    responses={
        404: {
            "model": ErrorResponse,
            "description": "No persisted assessment at this zone/timestamp.",
        },
    },
)
def get_matches(
    zone_id: uuid.UUID,
    timestamp: datetime,
    top_n: int = Query(default=5, ge=1, le=_MAX_TOP_N),
    deck_key: str | None = None,
    session: Session = Depends(get_db_session),
) -> IncidentMatchesResponse:
    repo = RiskAssessmentRepository(session)
    current = repo.get_by_zone_and_timestamp(zone_id, timestamp)
    if current is None:
        raise APIError(
            status_code=404,
            code="ASSESSMENT_NOT_FOUND",
            message=f"No persisted assessment for zone {zone_id} at {timestamp.isoformat()}",
        )

    previous_candidates = repo.history_by_zone(zone_id, limit=1, before=timestamp, after=None)
    previous = previous_candidates[0] if previous_candidates else None

    matches = find_similar_incidents(session, current, previous, top_n=top_n, deck_key=deck_key)

    return IncidentMatchesResponse(
        zone_id=zone_id,
        timestamp=timestamp,
        matches=[
            IncidentMatchResponse(
                scenario_key=m.scenario_key,
                incident_name=m.incident_name,
                date=m.date,
                zone_id=m.zone_id,
                similarity=m.similarity,
                outcome_tier=m.outcome_tier,
                root_cause=m.root_cause,
                business_impact=m.business_impact,
                operational_impact=m.operational_impact,
                safety_impact=m.safety_impact,
                matching_features=m.matching_features,
                differing_features=m.differing_features,
                lessons_learned=[
                    LessonResponse(rule=lesson.rule, lesson=lesson.lesson)
                    for lesson in m.lessons_learned
                ],
                evidence_source=m.evidence_source,
            )
            for m in matches
        ],
    )


@router.get(
    "/analytics",
    response_model=CrossScenarioAnalyticsResponse,
    summary="Cross-scenario analytics across every (or one) deck",
    description="Deterministic aggregation over every indexed historical tick - most common "
    "causes, equipment issues, permit conflicts, worker hazards, and average resolution time. "
    "Two items (most effective interventions, industry comparisons) are honestly marked "
    "unavailable rather than fabricated - see src/historical/analytics.py.",
)
def get_analytics(
    deck_key: str | None = None,
    session: Session = Depends(get_db_session),
) -> CrossScenarioAnalyticsResponse:
    result = compute_analytics(session, deck_key=deck_key)
    return CrossScenarioAnalyticsResponse(
        total_incidents=result.total_incidents,
        total_indexed_ticks=result.total_indexed_ticks,
        most_common_causes=[RuleFrequencyResponse(**vars(f)) for f in result.most_common_causes],
        most_common_equipment_issues=[
            RuleFrequencyResponse(**vars(f)) for f in result.most_common_equipment_issues
        ],
        most_common_permit_conflicts=[
            RuleFrequencyResponse(**vars(f)) for f in result.most_common_permit_conflicts
        ],
        most_common_worker_hazards=[
            RuleFrequencyResponse(**vars(f)) for f in result.most_common_worker_hazards
        ],
        average_resolution_minutes=result.average_resolution_minutes,
        most_effective_interventions=UnavailableResponse(
            reason=result.most_effective_interventions.reason
        ),
        industry_comparisons=UnavailableResponse(reason=result.industry_comparisons.reason),
    )
