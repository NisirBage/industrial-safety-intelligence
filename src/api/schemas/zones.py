"""Response schema for ``Zone`` rows (Decision Intelligence Layer).

Exists because every REST response before this endpoint carried only
a ``zone_id`` UUID - the frontend showed truncated UUIDs everywhere,
disclosed as a known limitation in docs/frontend/README.md since M8.
This is the minimal backend addition that report recommended.
"""

import uuid

from pydantic import BaseModel, ConfigDict, Field


class ZoneResponse(BaseModel):
    """One ``Zone`` row - metadata only, never a risk value (that
    stays exclusively in ``RiskAssessmentResponse``)."""

    model_config = ConfigDict(
        from_attributes=True,
        json_schema_extra={
            "example": {
                "zone_id": "52b30591-0bfa-5faf-8849-2ee43ed4557b",
                "name": "Tank Farm",
                "plant_section": "Storage",
                "oisd_area_classification": "unclassified",
            }
        },
    )

    zone_id: uuid.UUID
    name: str = Field(description='Human-readable name, e.g. "Tank Farm".')
    plant_section: str = Field(description='e.g. "Storage", "Compression".')
    oisd_area_classification: str = Field(
        description="One of: zone_0, zone_1, zone_2, unclassified."
    )


class ZoneWorkerCountResponse(BaseModel):
    """Raw headcount for one zone - plant metadata, not a risk value.

    Backs the Executive KPI Dashboard's "Workers Exposed" card
    (Presentation Layer milestone). Deliberately a separate,
    additive endpoint rather than a new field folded into
    ``ZoneResponse``: it reads a different table
    (``WorkerRepository.list_by_current_zone``) that has never been
    exposed via REST before, so keeping it isolated makes clear this
    is new surface area, not a change to the existing zones contract.
    """

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "zone_id": "52b30591-0bfa-5faf-8849-2ee43ed4557b",
                "worker_count": 3,
            }
        },
    )

    zone_id: uuid.UUID
    worker_count: int = Field(
        description="Workers whose current_zone_id is this zone right now. "
        "0 for an unknown zone_id, matching this API's existing convention "
        "for zone-scoped reads (no error, no readings)."
    )
