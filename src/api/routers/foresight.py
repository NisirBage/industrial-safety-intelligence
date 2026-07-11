"""Operational Foresight REST router - M25.

Read-only, same as every other router in this API: orchestrates a call
into `src/foresight/*` and shapes the response. Never runs a scenario,
never writes anything, never recomputes risk - every value returned is
a deterministic aggregation over already-persisted `RiskAssessment`
rows and `src/historical/`'s already-cataloged incidents.

Per this milestone's explicit architectural principle: this router
never returns a recommendation of its own. Every forecast point,
progression stage, and early-warning signal carries an evidence
citation (matched incidents, similarity, counts) rather than a bare
number - context and trend evidence only. The deterministic engine's
own `GET /risk/current`/`/risk/history/{zone_id}` remain the sole
source of an operational recommendation.
"""

import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from src.api.common.errors import APIError, ErrorResponse
from src.api.dependencies import get_db_session
from src.api.schemas.foresight import (
    DeckContributionResponse,
    EarlyWarningSignalResponse,
    ForecastEvidenceResponse,
    ForecastPointResponse,
    ForesightConfidenceResponse,
    ForesightResponse,
    IncidentProgressionResponse,
    MatchSummaryResponse,
    ProgressionStageResponse,
)
from src.foresight.progression import ProgressionStage
from src.foresight.service import generate_operational_foresight
from src.infra.db.repositories import RiskAssessmentRepository
from src.services.scenario_catalog import get_scenario_summary

router = APIRouter(prefix="/foresight", tags=["foresight"])

_MAX_WINDOW_SIZE = 20
_MAX_TOP_N = 20


@router.get(
    "/forecast",
    response_model=ForesightResponse,
    summary="Operational Foresight - trajectory-matched forecast, confidence, progression",
    description="Given a zone's trailing window of persisted assessments, matches the whole "
    "recent trajectory (not just the current tick) against historical trajectories and "
    "projects 15/30/60-minute outcomes by aggregating REAL historical continuations - never a "
    "fitted or extrapolated model. Every projection cites its matched incidents; the "
    "deterministic engine's own risk/recommendation endpoints remain authoritative.",
    responses={
        404: {
            "model": ErrorResponse,
            "description": "No persisted assessment at this zone/timestamp.",
        },
    },
)
def get_forecast(
    zone_id: uuid.UUID,
    timestamp: datetime,
    scenario_key: str,
    window_size: int = Query(default=5, ge=1, le=_MAX_WINDOW_SIZE),
    top_n: int = Query(default=5, ge=1, le=_MAX_TOP_N),
    deck_key: str | None = None,
    session: Session = Depends(get_db_session),
) -> ForesightResponse:
    repo = RiskAssessmentRepository(session)
    current = repo.get_by_zone_and_timestamp(zone_id, timestamp)
    if current is None:
        raise APIError(
            status_code=404,
            code="ASSESSMENT_NOT_FOUND",
            message=f"No persisted assessment for zone {zone_id} at {timestamp.isoformat()}",
        )

    preceding = repo.history_by_zone(zone_id, limit=window_size - 1, before=timestamp, after=None)
    recent_assessments = [*reversed(preceding), current]

    result = generate_operational_foresight(
        session,
        zone_id,
        scenario_key,
        recent_assessments,
        window_size=window_size,
        deck_key=deck_key,
        top_n=top_n,
    )

    matches = [
        MatchSummaryResponse(
            scenario_key=match.trajectory.scenario_key,
            incident_name=(
                summary.title
                if (summary := get_scenario_summary(match.trajectory.scenario_key)) is not None
                else match.trajectory.scenario_key
            ),
            zone_id=match.trajectory.zone_id,
            anchor_timestamp=match.trajectory.steps[match.anchor_index].timestamp,
            similarity=match.similarity,
            window_length=match.window_length,
        )
        for match in result.matches
    ]

    forecast = [
        ForecastPointResponse(
            horizon_minutes=point.horizon_minutes,
            projected_risk=point.projected_risk,
            projected_tier=point.projected_tier,
            evidence=[
                ForecastEvidenceResponse(
                    scenario_key=item.scenario_key,
                    zone_id=item.zone_id,
                    similarity=item.similarity,
                    observed_risk=item.observed_risk,
                    observed_tier=item.observed_tier,
                    observed_timestamp=item.observed_timestamp,
                    minutes_after_anchor=item.minutes_after_anchor,
                )
                for item in point.evidence
            ],
            unavailable_reason=point.unavailable_reason,
        )
        for point in result.forecast
    ]

    def _stage(stage: ProgressionStage) -> ProgressionStageResponse:
        return ProgressionStageResponse(
            label=stage.label,
            tier=stage.tier,
            supporting_matches=stage.supporting_matches,
            total_matches=stage.total_matches,
            evidence=stage.evidence,
        )

    progression = IncidentProgressionResponse(
        current_stage=_stage(result.progression.current_stage),
        likely_next_stage=_stage(result.progression.likely_next_stage),
        likely_following_stage=_stage(result.progression.likely_following_stage),
        expected_resolution=_stage(result.progression.expected_resolution),
    )

    early_warning = EarlyWarningSignalResponse(
        category=result.early_warning.category,
        why=result.early_warning.why,
        supporting_matches=result.early_warning.supporting_matches,
        total_matches=result.early_warning.total_matches,
    )

    confidence = ForesightConfidenceResponse(
        historical_agreement=result.confidence.historical_agreement,
        data_completeness=result.confidence.data_completeness,
        trajectory_similarity=result.confidence.trajectory_similarity,
        replay_coverage=result.confidence.replay_coverage,
        overall=result.confidence.overall,
    )

    deck_contributions = [
        DeckContributionResponse(
            deck_key=contribution.deck_key,
            deck_name=contribution.deck_name,
            matched_incident_count=contribution.matched_incident_count,
        )
        for contribution in result.deck_contributions
    ]

    return ForesightResponse(
        zone_id=result.zone_id,
        timestamp=result.timestamp,
        current_risk_score=result.current_risk_score,
        current_tier=result.current_tier,
        window_size=result.window_size,
        current_window_length=result.current_window_length,
        matches=matches,
        forecast=forecast,
        confidence=confidence,
        progression=progression,
        early_warning=early_warning,
        deck_contributions=deck_contributions,
    )
