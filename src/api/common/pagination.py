"""Shared pagination (A.5) - one convention for every list-returning endpoint.

Resolves the Master Plan's own named gap ("No pagination on
/risk/history/{zone}"): every list endpoint accepts ``limit``
(default 100, max 1000) and ``before``/``after`` timestamp cursors,
declared once here rather than duplicated per router.
"""

from datetime import datetime
from typing import Generic, TypeVar

from fastapi import Query
from pydantic import BaseModel

DEFAULT_LIMIT = 100
MAX_LIMIT = 1000

T = TypeVar("T")


class PaginationParams(BaseModel):
    limit: int
    before: datetime | None
    after: datetime | None


def pagination_params(
    limit: int = Query(DEFAULT_LIMIT, ge=1, le=MAX_LIMIT),
    before: datetime | None = Query(None),
    after: datetime | None = Query(None),
) -> PaginationParams:
    return PaginationParams(limit=limit, before=before, after=after)


class PaginatedResponse(BaseModel, Generic[T]):
    """``count`` is simply ``len(items)`` - if it equals ``limit``,
    there may be more results the caller can page for with a
    ``before``/``after`` cursor; this endpoint never computes a total
    row count, which would be a separate, more expensive query this
    project's own "boring API surface" guidance doesn't ask for."""

    items: list[T]
    limit: int
    count: int
