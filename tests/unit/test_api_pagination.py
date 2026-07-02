"""Unit tests for the shared pagination dependency/response wrapper.

No HTTP layer, no database - ``pagination_params`` is an ordinary
Python function FastAPI happens to call as a dependency; it's called
directly here, the same way every other pure function in this
project is unit-tested.
"""

from datetime import UTC, datetime

from src.api.common.pagination import (
    DEFAULT_LIMIT,
    MAX_LIMIT,
    PaginatedResponse,
    pagination_params,
)


def test_pagination_params_uses_defaults_when_omitted() -> None:
    params = pagination_params(limit=DEFAULT_LIMIT, before=None, after=None)
    assert params.limit == DEFAULT_LIMIT
    assert params.before is None
    assert params.after is None


def test_pagination_params_carries_explicit_values() -> None:
    before = datetime(2026, 7, 1, tzinfo=UTC)
    after = datetime(2026, 6, 1, tzinfo=UTC)
    params = pagination_params(limit=50, before=before, after=after)
    assert params.limit == 50
    assert params.before == before
    assert params.after == after


def test_documented_ceiling_and_default_match_the_master_plan_gap_resolution() -> None:
    """Master Plan gap resolution: "limit (default 100, max 1000)"."""
    assert DEFAULT_LIMIT == 100
    assert MAX_LIMIT == 1000


def test_paginated_response_shape() -> None:
    response = PaginatedResponse[int](items=[1, 2, 3], limit=100, count=3)
    assert response.items == [1, 2, 3]
    assert response.limit == 100
    assert response.count == 3
