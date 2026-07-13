"""Compliance & Standards REST router - M27 Part 1.

A single, additive, read-only, database-free endpoint: given a
recommendation id, return its supporting standard references. Computes
nothing, never generates a recommendation - see
`src/compliance/standards.py` for the full anti-fabrication rationale.
"""

from fastapi import APIRouter

from src.api.schemas.compliance import ComplianceStandardsResponse, StandardReferenceResponse
from src.compliance.standards import standards_for_recommendation

router = APIRouter(prefix="/compliance", tags=["compliance"])


@router.get(
    "/standards/{recommendation_id}",
    response_model=ComplianceStandardsResponse,
    summary="Supporting standard references for a recommendation id",
    description="Static reference data only - these standards support the "
    "recommendation the deterministic engine already produced; they never "
    "generate it. Returns an empty list for an unrecognized id rather than 404, "
    "since 'no supporting standards curated yet' is a valid, honest answer.",
)
def get_compliance_standards(recommendation_id: str) -> ComplianceStandardsResponse:
    standards = standards_for_recommendation(recommendation_id)
    return ComplianceStandardsResponse(
        recommendation_id=recommendation_id,
        standards=[
            StandardReferenceResponse(
                code=s.code,
                title=s.title,
                summary=s.summary,
                applicability=s.applicability,
                external_reference=s.external_reference,
            )
            for s in standards
        ],
    )
