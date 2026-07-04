"""Response schema for ``Equipment`` rows.

Added for the Scenario Builder's read-only equipment browser.
Equipment is static plant metadata, not a scenario-authored event -
the frozen ``Scenario`` schema (``src/domain/simulation/scenario.py``)
has no equipment-event concept, so a scenario can reference an
equipment record's *existing* state through the Equipment Status
agent's context builder, but cannot create or change one. The three
fields below are exactly what that agent's frozen
``EquipmentRecord``/``_is_degraded`` consume
(``src/domain/agents/equipment_status.py``) - "health," "inspection
overdue," and "failure probability" as used loosely in product
requirements map onto these three real, already-existing fields and
nothing else; there is no separate probability field anywhere in the
domain model.
"""

import uuid

from pydantic import BaseModel, ConfigDict, Field


class EquipmentResponse(BaseModel):
    """One ``Equipment`` row - plant metadata only, never a risk value."""

    model_config = ConfigDict(
        from_attributes=True,
        json_schema_extra={
            "example": {
                "equipment_id": "1f2e3d4c-5b6a-5978-8675-4433221100ff",
                "zone_id": "52b30591-0bfa-5faf-8849-2ee43ed4557b",
                "equipment_type": "gas_detector",
                "isolation_status": "active",
                "maintenance_flag": False,
                "loto_confirmed": False,
            }
        },
    )

    equipment_id: uuid.UUID
    zone_id: uuid.UUID
    equipment_type: str
    isolation_status: str = Field(description="One of: isolated, active, degraded.")
    maintenance_flag: bool = Field(
        description="Maps to the everyday notion of 'inspection overdue' - the only "
        "existing deterministic field for it."
    )
    loto_confirmed: bool = Field(
        description="Lockout-tagout confirmed. Counted as a degradation signal by the "
        "Equipment Status agent alongside isolation_status and maintenance_flag."
    )
