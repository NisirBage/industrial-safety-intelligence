"""Structured logging: JSON shape and the standard correlation fields."""

import json
import logging
from datetime import UTC, datetime

from src.config.logging import JSONFormatter, log_event

NOW = datetime(2026, 7, 1, 8, 0, 0, tzinfo=UTC)


def _capture(logger_name: str) -> tuple[logging.Logger, logging.Handler, list[str]]:
    logger = logging.getLogger(logger_name)
    logger.setLevel(logging.DEBUG)
    lines: list[str] = []

    class _CaptureHandler(logging.Handler):
        def emit(self, record: logging.LogRecord) -> None:
            lines.append(self.format(record))

    handler = _CaptureHandler()
    handler.setFormatter(JSONFormatter())
    logger.addHandler(handler)
    return logger, handler, lines


def test_log_event_emits_all_standard_fields() -> None:
    logger, handler, lines = _capture("test_log_event_emits_all_standard_fields")
    try:
        log_event(
            logger,
            logging.WARNING,
            "stale_sensor_data",
            tick_id=7,
            sim_time=NOW,
            agent="gas_risk",
            zone="zone-tank-farm",
        )
    finally:
        logger.removeHandler(handler)

    payload = json.loads(lines[0])
    assert payload["level"] == "WARNING"
    assert payload["event"] == "stale_sensor_data"
    assert payload["tick_id"] == 7
    assert payload["sim_time"] == NOW.isoformat()
    assert payload["agent"] == "gas_risk"
    assert payload["zone"] == "zone-tank-farm"


def test_formatter_omits_correlation_fields_when_absent() -> None:
    logger, handler, lines = _capture("test_formatter_omits_correlation_fields_when_absent")
    try:
        logger.info("plain message")
    finally:
        logger.removeHandler(handler)

    payload = json.loads(lines[0])
    assert set(payload.keys()) == {"timestamp", "level", "event"}
    assert payload["level"] == "INFO"
    assert payload["event"] == "plain message"
    # Real ISO 8601, not just any string - proves it's machine-parseable.
    datetime.fromisoformat(payload["timestamp"])


def test_formatter_includes_request_id_when_present() -> None:
    logger, handler, lines = _capture("test_formatter_includes_request_id_when_present")
    try:
        logger.info("request handled", extra={"request_id": "abc-123"})
    finally:
        logger.removeHandler(handler)

    payload = json.loads(lines[0])
    assert payload["request_id"] == "abc-123"
