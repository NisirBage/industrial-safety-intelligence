"""Response shapes for the Compliance & Standards API (M27 Part 1).
Every field reshapes `src/compliance/standards.py::StandardReference`
exactly - no new computation."""

from pydantic import BaseModel


class StandardReferenceResponse(BaseModel):
    code: str
    title: str
    summary: str
    applicability: str
    external_reference: str


class ComplianceStandardsResponse(BaseModel):
    recommendation_id: str
    standards: list[StandardReferenceResponse]
