"""M27 Part 1 - the compliance reference table itself.

Every entry cites a real, published standard by its real designation
(OSHA's actual CFR part/section, the real IEC/API/NFPA document
numbers) - never a fabricated citation. "Company SOP" entries are the
one deliberate exception: this fictional demo plant has no real
internal document control system, so those entries are honestly
labeled as an internal placeholder rather than invented with a fake
document number, matching this project's established anti-fabrication
discipline (see `src/historical/decks.py`'s "one honest deck").

Keyed by the same recommendation ids
`src/knowledge_graph/recommendation_text.py` already defines - not a
new vocabulary. A recommendation's supporting standards are looked up
by its own `id`, never derived from risk, confidence, or tier
directly.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class StandardReference:
    code: str
    title: str
    summary: str
    applicability: str
    external_reference: str


_OSHA_GENERAL_DUTY = StandardReference(
    code="OSHA General Duty Clause",
    title="Occupational Safety and Health Act, Section 5(a)(1)",
    summary=(
        "Requires employers to furnish a workplace free from recognized "
        "hazards likely to cause death or serious physical harm."
    ),
    applicability=(
        "Applies whenever a zone's risk tier indicates a recognized, uncontrolled hazard."
    ),
    external_reference="29 U.S.C. §654(a)(1)",
)

_OSHA_CONFINED_SPACE = StandardReference(
    code="OSHA 1910.146",
    title="Permit-Required Confined Spaces",
    summary=(
        "Governs entry authorization, attendant duties, and headcount "
        "verification for permit-required confined spaces."
    ),
    applicability=(
        "Applies when personnel presence or permit status in a confined-space zone is in question."
    ),
    external_reference="29 CFR 1910.146",
)

_OSHA_LOTO = StandardReference(
    code="OSHA 1910.147",
    title="The Control of Hazardous Energy (Lockout/Tagout)",
    summary="Governs isolation of hazardous energy sources during servicing and maintenance.",
    applicability="Applies when a permit status change affects equipment isolation.",
    external_reference="29 CFR 1910.147",
)

_OSHA_PSM = StandardReference(
    code="OSHA 1910.119",
    title="Process Safety Management of Highly Hazardous Chemicals",
    summary=(
        "Requires management-of-change review and documented authorization "
        "for process modifications."
    ),
    applicability=(
        "Applies when a permit or work-authorization escalation affects a covered process."
    ),
    external_reference="29 CFR 1910.119",
)

_IEC_61511 = StandardReference(
    code="IEC 61511",
    title="Functional Safety - Safety Instrumented Systems for the Process Industry Sector",
    summary=(
        "Defines fail-safe behavior, common-cause-failure considerations, and "
        "diagnostic/proof-testing requirements for safety instrumented systems."
    ),
    applicability=(
        "Applies whenever sensor or agent data is missing, stale, or a "
        "common-cause failure is suspected."
    ),
    external_reference="IEC 61511-1:2016",
)

_API_RP_754 = StandardReference(
    code="API RP 754",
    title="Process Safety Performance Indicators for the Refining and Petrochemical Industries",
    summary=(
        "Defines Tier 1-4 process safety event indicators and leading "
        "indicators for escalating operational risk."
    ),
    applicability=(
        "Applies to tier escalations and simultaneous-operations (SIMOPS) risk compounding."
    ),
    external_reference="API Recommended Practice 754, 2nd Edition",
)

_NFPA_326 = StandardReference(
    code="NFPA 326",
    title="Standard for the Safeguarding of Tanks and Containers for Entry, Cleaning, or Repair",
    summary="Governs atmospheric monitoring and safeguards for tank/container entry work.",
    applicability="Applies to gas-monitoring zones with tank or vessel entry activity.",
    external_reference="NFPA 326",
)


def _company_sop(topic: str, summary: str) -> StandardReference:
    return StandardReference(
        code="Company SOP",
        title=f"Company SOP - {topic}",
        summary=summary,
        applicability="Internal to this facility.",
        external_reference="Internal document control system (not modeled in this demo).",
    )


#: Keyed by the exact recommendation ids `recommendation_text.py`
#: defines - `TIER_BASELINE`'s three tier ids plus the 9 rule ids.
STANDARDS_FOR_RECOMMENDATION: dict[str, list[StandardReference]] = {
    "tier_critical": [
        _OSHA_GENERAL_DUTY,
        _API_RP_754,
        _company_sop(
            "Emergency Response", "Evacuation and notification procedure for a critical-tier zone."
        ),
    ],
    "tier_elevated": [
        _API_RP_754,
        _company_sop(
            "Enhanced Monitoring", "Increased observation cadence for an elevated-tier zone."
        ),
    ],
    "tier_watch": [
        _company_sop("Routine Observation", "Standing watch-tier logging and review cadence."),
    ],
    "unauthorized_presence": [
        _OSHA_CONFINED_SPACE,
        _company_sop("Access Control", "Headcount verification and unauthorized-entry response."),
    ],
    "permit_status_escalated": [
        _OSHA_LOTO,
        _OSHA_PSM,
        _company_sop("Permit to Work", "Permit review and suspension/revocation procedure."),
    ],
    "common_cause_grouped_degradation_count": [
        _IEC_61511,
        _API_RP_754,
        _company_sop(
            "Equipment Reliability", "Inspection procedure for common-cause equipment degradation."
        ),
    ],
    "stale_data_fail_safe": [
        _IEC_61511,
        _company_sop(
            "Instrumentation Maintenance", "Technician dispatch procedure for stale sensor data."
        ),
    ],
    "missing_data_fail_safe": [
        _IEC_61511,
        _company_sop("Instrumentation Maintenance", "Instrumentation-failure response procedure."),
    ],
    "missing_location_fail_safe": [
        _OSHA_CONFINED_SPACE,
        _company_sop("Personnel Tracking", "Manual headcount confirmation procedure."),
    ],
    "missing_equipment_context": [
        _NFPA_326,
        _company_sop(
            "Equipment Status Verification", "Manual equipment status confirmation procedure."
        ),
    ],
    "agent_unavailable_using_last_known": [
        _IEC_61511,
        _company_sop(
            "System Health Monitoring", "Upstream system availability confirmation procedure."
        ),
    ],
    "interaction_bonus_applied": [
        _API_RP_754,
        _company_sop(
            "Simultaneous Operations (SIMOPS) Management", "Concurrent-activity review procedure."
        ),
    ],
}


def standards_for_recommendation(recommendation_id: str) -> list[StandardReference]:
    """Supporting references for one recommendation id - never a
    reason it was generated, only context for it. Returns a copy so a
    caller can never mutate the module-level reference table."""
    return list(STANDARDS_FOR_RECOMMENDATION.get(recommendation_id, []))


__all__ = ["StandardReference", "STANDARDS_FOR_RECOMMENDATION", "standards_for_recommendation"]
