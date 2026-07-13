"""Real CSV ingestion (Part 4) - reads a CSV file of sensor readings
(columns: sensor_id, value, unit, timestamp, and an optional
quality_flag) and ingests each row through `ingest_reading()`. A real,
functional connector - not a mock, unlike the MQTT/OPC-UA adapters in
`connectors.py`. Ingests once per call; a caller wanting continuous
watching (e.g. polling a directory for new files) supplies its own
loop around this function - it only does the parse-and-ingest step.
One malformed row is recorded and skipped rather than aborting the
whole file.
"""

from __future__ import annotations

import csv
import uuid
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path

from sqlalchemy.orm import Session

from src.live_ingestion.service import UnknownSensorError, ingest_reading


@dataclass(frozen=True)
class CsvIngestResult:
    rows_processed: int
    rows_failed: int
    errors: list[str] = field(default_factory=list)


def ingest_csv_file(session: Session, path: Path) -> CsvIngestResult:
    rows_processed = 0
    rows_failed = 0
    errors: list[str] = []

    with path.open(newline="", encoding="utf-8") as csv_file:
        reader = csv.DictReader(csv_file)
        for row_index, row in enumerate(reader, start=2):  # header is row 1
            try:
                ingest_reading(
                    session,
                    sensor_id=uuid.UUID(row["sensor_id"]),
                    value=float(row["value"]),
                    unit=row["unit"],
                    timestamp=datetime.fromisoformat(row["timestamp"]),
                    quality_flag=row.get("quality_flag") or "ok",
                )
                rows_processed += 1
            except (KeyError, ValueError, TypeError, UnknownSensorError) as exc:
                rows_failed += 1
                errors.append(f"row {row_index}: {exc}")

    return CsvIngestResult(rows_processed=rows_processed, rows_failed=rows_failed, errors=errors)


__all__ = ["CsvIngestResult", "ingest_csv_file"]
