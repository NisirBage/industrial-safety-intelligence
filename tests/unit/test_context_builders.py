"""Context Builder pure-assembly-helper tests.

Covers only the DB-free pure functions in
``src/services/context_builders.py`` - the reshaping logic a context
builder applies once repository rows already exist. The repository-
querying closures (``make_*_context_builder``) need a live database
and are covered by ``tests/integration/test_context_builders_integration.py``
instead, following this project's established unit/integration split.

ORM model instances below are constructed directly, never through a
session - SQLAlchemy declarative models are plain Python objects until
something calls a session method on them, so this stays a fast,
DB-free unit test suite.
"""

import uuid
from datetime import UTC, datetime

import pytest

from src.domain.agents.base import AgentResult, Justification
from src.domain.agents.equipment_status import EquipmentRecord
from src.domain.agents.gas_risk import GasReading
from src.domain.agents.permit_intelligence import PermitBaselineSnapshot, PermitRecord
from src.domain.agents.worker_exposure import PermitCoverage, WorkerPresence
from src.infra.db.models.equipment import Equipment
from src.infra.db.models.permit import Permit
from src.infra.db.models.worker import Worker
from src.services.context_builders import (
    _assemble_equipment_status_context,
    _assemble_gas_risk_context,
    _assemble_permit_intelligence_context,
    _assemble_worker_exposure_context,
    _derive_permit_coverage,
    _extract_gas_risk_score,
    _parse_baseline_snapshot,
    _to_equipment_record,
    _to_permit_record,
    _to_worker_presence,
)

NOW = datetime(2026, 7, 1, 8, 0, 0, tzinfo=UTC)
ZONE_ID = uuid.uuid4()


# --- Gas Risk --------------------------------------------------------------------


def test_assemble_gas_risk_context_matches_frozen_context_keys() -> None:
    readings = [GasReading(timestamp=NOW, value=20.0)]
    context = _assemble_gas_risk_context(
        readings=readings,
        alarm_threshold=35.0,
        last_calibrated_at=NOW,
        elevated_floor_override=45.0,
    )
    assert context == {
        "readings": readings,
        "alarm_threshold": 35.0,
        "last_calibrated_at": NOW,
        "elevated_floor_override": 45.0,
    }


def test_assemble_gas_risk_context_preserves_none_override() -> None:
    context = _assemble_gas_risk_context(
        readings=[], alarm_threshold=35.0, last_calibrated_at=None, elevated_floor_override=None
    )
    assert context["elevated_floor_override"] is None
    assert context["last_calibrated_at"] is None


# --- Equipment Status --------------------------------------------------------------


def test_to_equipment_record_maps_every_field() -> None:
    row = Equipment(
        equipment_id=uuid.uuid4(),
        zone_id=ZONE_ID,
        equipment_type="valve",
        isolation_status="degraded",
        maintenance_flag=True,
        loto_confirmed=False,
    )
    record = _to_equipment_record(row)
    assert record == EquipmentRecord(
        identifier=str(row.equipment_id),
        equipment_type="valve",
        isolation_status="degraded",
        maintenance_flag=True,
        loto_confirmed=False,
    )


def test_assemble_equipment_status_context_always_includes_key() -> None:
    assert _assemble_equipment_status_context([]) == {"equipment": []}


# --- Worker Exposure ----------------------------------------------------------------


def test_to_worker_presence_maps_every_field() -> None:
    row = Worker(worker_id=uuid.uuid4(), role="operator", current_zone_id=ZONE_ID)
    presence = _to_worker_presence(row)
    assert presence == WorkerPresence(identifier=str(row.worker_id), role="operator")


def _permit_intelligence_result(evidence: dict[str, object] | None) -> AgentResult:
    return AgentResult(
        agent_name="permit_intelligence",
        risk=0.0,
        confidence=1.0,
        justification=Justification(summary="test", evidence=evidence),
        computed_at=NOW,
    )


def test_derive_permit_coverage_none_result_means_no_coverage() -> None:
    assert _derive_permit_coverage(None) == PermitCoverage(has_active_permit=False)


def test_derive_permit_coverage_true_when_decisions_present() -> None:
    result = _permit_intelligence_result({"decisions": [{"permit_identifier": "p1"}]})
    assert _derive_permit_coverage(result) == PermitCoverage(has_active_permit=True)


def test_derive_permit_coverage_false_when_decisions_empty() -> None:
    result = _permit_intelligence_result({"decisions": []})
    assert _derive_permit_coverage(result) == PermitCoverage(has_active_permit=False)


def test_derive_permit_coverage_false_when_evidence_missing_decisions_key() -> None:
    """A decayed last-known-value result carries a different evidence
    shape (no "decisions" key) - must degrade to no-coverage, not raise."""
    result = _permit_intelligence_result({"original_computed_at": "..."})
    assert _derive_permit_coverage(result) == PermitCoverage(has_active_permit=False)


def test_derive_permit_coverage_false_when_evidence_is_none() -> None:
    result = _permit_intelligence_result(None)
    assert _derive_permit_coverage(result) == PermitCoverage(has_active_permit=False)


def test_assemble_worker_exposure_context_shape() -> None:
    workers = [WorkerPresence(identifier="w1", role="operator")]
    coverage = PermitCoverage(has_active_permit=True)
    assert _assemble_worker_exposure_context(workers, coverage) == {
        "workers_present": workers,
        "permit_coverage": coverage,
    }


# --- Permit Intelligence -------------------------------------------------------------


def test_parse_baseline_snapshot_roundtrip() -> None:
    raw = {
        "schema_version": 1,
        "algorithm_version": 1,
        "gas_risk_at_issuance": 40.0,
        "confidence_at_issuance": 0.5,
        "captured_at": NOW.isoformat(),
    }
    snapshot = _parse_baseline_snapshot(raw)
    assert snapshot == PermitBaselineSnapshot(
        schema_version=1,
        algorithm_version=1,
        gas_risk_at_issuance=40.0,
        confidence_at_issuance=0.5,
        captured_at=NOW,
    )


def test_parse_baseline_snapshot_raises_on_missing_key() -> None:
    with pytest.raises(ValueError, match="malformed baseline_snapshot"):
        _parse_baseline_snapshot({"schema_version": 1})


def test_to_permit_record_maps_every_field() -> None:
    baseline_raw = {
        "schema_version": 1,
        "algorithm_version": 1,
        "gas_risk_at_issuance": 40.0,
        "confidence_at_issuance": 0.5,
        "captured_at": NOW.isoformat(),
    }
    row = Permit(
        permit_id=uuid.uuid4(),
        permit_type="hot_work",
        zone_id=ZONE_ID,
        issued_at=NOW,
        expires_at=NOW,
        authorizing_officer_id=uuid.uuid4(),
        baseline_snapshot=baseline_raw,
        status="active",
    )
    record = _to_permit_record(row)
    assert record.identifier == str(row.permit_id)
    assert record.permit_type == "hot_work"
    assert record.zone_id == ZONE_ID
    assert record.status == "active"
    assert record.baseline == _parse_baseline_snapshot(baseline_raw)


def test_extract_gas_risk_score_from_well_formed_justification() -> None:
    justification = {"agent_contributions": {"gas_risk": {"risk": 62.5, "confidence": 0.9}}}
    assert _extract_gas_risk_score(justification) == 62.5


@pytest.mark.parametrize(
    "justification",
    [
        {},
        {"agent_contributions": "not-a-dict"},
        {"agent_contributions": {}},
        {"agent_contributions": {"gas_risk": "not-a-dict"}},
        {"agent_contributions": {"gas_risk": {}}},
        {"agent_contributions": {"gas_risk": {"risk": "not-a-number"}}},
    ],
)
def test_extract_gas_risk_score_returns_none_for_malformed_input(
    justification: dict[str, object],
) -> None:
    assert _extract_gas_risk_score(justification) is None


def test_assemble_permit_intelligence_context_shape() -> None:
    permits: list[PermitRecord] = []
    context = _assemble_permit_intelligence_context(permits, True, [])
    assert context == {"permits": [], "permit_feed_stale": True, "adjacent_zones": []}
