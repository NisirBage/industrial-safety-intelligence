"""Structured logging configuration and the standard field set (A.13).

Exists so every agent-tick log line carries the same correlation
fields in one consistent shape, rather than each agent formatting its
own log strings ad hoc - the same "one object, one place" discipline
already applied to settings.py. src/domain/agents/base.py's
implementations depend on ``log_event`` from M3B onward; this file
uses only the standard library, adding no new dependency for what
A.13 explicitly allows to be "stdlib logging with a JSON formatter."
"""

import json
import logging
from datetime import datetime
from typing import Any

_CORRELATION_FIELDS = ("tick_id", "sim_time", "agent", "zone")


class JSONFormatter(logging.Formatter):
    """Renders each log record as one JSON object.

    Deliberately not a general-purpose formatter - it emits exactly
    the field set A.13 specifies (level, event, plus whichever
    correlation fields a given call site provided) and nothing else.
    """

    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {"level": record.levelname, "event": record.getMessage()}
        for field_name in _CORRELATION_FIELDS:
            value = getattr(record, field_name, None)
            if value is not None:
                payload[field_name] = value
        return json.dumps(payload, default=str)


def configure_logging(level: int = logging.INFO) -> None:
    """Attach a single JSON-formatting handler to the root logger.

    Replaces rather than appends handlers, so calling this more than
    once (e.g. once per test) doesn't accumulate duplicate output.
    """
    handler = logging.StreamHandler()
    handler.setFormatter(JSONFormatter())
    root = logging.getLogger()
    root.handlers = [handler]
    root.setLevel(level)


def log_event(
    logger: logging.Logger,
    level: int,
    event: str,
    *,
    tick_id: int,
    sim_time: datetime,
    agent: str,
    zone: str,
) -> None:
    """Log one structured event with the standard correlation fields.

    Exists so agents never hand-build the ``extra={...}`` dict
    themselves - one call site, one field set, matching A.13 exactly:
    tick_id, sim_time, agent, zone, level, event.
    """
    logger.log(
        level,
        event,
        extra={
            "tick_id": tick_id,
            "sim_time": sim_time.isoformat(),
            "agent": agent,
            "zone": zone,
        },
    )
