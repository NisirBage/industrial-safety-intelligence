"""Unit tests for src/live_ingestion/csv_watcher.py - the CSV parsing
and per-row error handling, with `ingest_reading` itself stubbed out
(no database needed) since that function's own DB-backed behavior is
exercised separately (see the integration suite)."""

import uuid
from datetime import UTC, datetime
from pathlib import Path

import pytest

from src.live_ingestion import csv_watcher
from src.live_ingestion.service import UnknownSensorError

SENSOR_ID = uuid.uuid4()


def _write_csv(tmp_path: Path, rows: list[str]) -> Path:
    path = tmp_path / "readings.csv"
    path.write_text("\n".join(["sensor_id,value,unit,timestamp", *rows]), encoding="utf-8")
    return path


def test_ingests_every_well_formed_row(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[dict[str, object]] = []

    def fake_ingest_reading(session: object, **kwargs: object) -> object:
        calls.append(kwargs)
        return object()

    monkeypatch.setattr(csv_watcher, "ingest_reading", fake_ingest_reading)

    path = _write_csv(
        tmp_path,
        [
            f"{SENSOR_ID},12.5,ppm,2026-07-01T08:00:00+00:00",
            f"{SENSOR_ID},14.0,ppm,2026-07-01T08:05:00+00:00",
        ],
    )
    result = csv_watcher.ingest_csv_file(session=object(), path=path)

    assert result.rows_processed == 2
    assert result.rows_failed == 0
    assert len(calls) == 2
    assert calls[0]["sensor_id"] == SENSOR_ID
    assert calls[0]["value"] == 12.5
    assert calls[0]["timestamp"] == datetime(2026, 7, 1, 8, 0, 0, tzinfo=UTC)


def test_records_and_skips_a_malformed_row_without_aborting_the_file(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(csv_watcher, "ingest_reading", lambda session, **kwargs: object())

    path = _write_csv(
        tmp_path,
        [
            "not-a-uuid,12.5,ppm,2026-07-01T08:00:00+00:00",
            f"{SENSOR_ID},14.0,ppm,2026-07-01T08:05:00+00:00",
        ],
    )
    result = csv_watcher.ingest_csv_file(session=object(), path=path)

    assert result.rows_processed == 1
    assert result.rows_failed == 1
    assert "row 2" in result.errors[0]


def test_propagates_unknown_sensor_as_a_recorded_row_failure(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    def fake_ingest_reading(session: object, **kwargs: object) -> object:
        raise UnknownSensorError("no such sensor")

    monkeypatch.setattr(csv_watcher, "ingest_reading", fake_ingest_reading)

    path = _write_csv(tmp_path, [f"{SENSOR_ID},12.5,ppm,2026-07-01T08:00:00+00:00"])
    result = csv_watcher.ingest_csv_file(session=object(), path=path)

    assert result.rows_processed == 0
    assert result.rows_failed == 1
    assert "no such sensor" in result.errors[0]
