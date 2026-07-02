"""Shared error contract (A.5).

Not given an exact shape anywhere in the source documents - "the
shared error contract from A.5" is named but never defined, the same
"missing specification, propose a reasonable convention" situation
this project has resolved the same way at every prior milestone.
Proposed, not cited: one envelope, ``{"error": {"code", "message",
"details"}}``, applied to every error response this API returns
(validation failures, explicit ``APIError``s, and uncaught
exceptions alike) via the exception handlers registered in
``src/api/main.py``.
"""

import logging
from typing import Any

from fastapi import Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel

logger = logging.getLogger(__name__)


class ErrorDetail(BaseModel):
    code: str
    message: str
    details: dict[str, Any] | None = None


class ErrorResponse(BaseModel):
    error: ErrorDetail


class APIError(Exception):
    """Raised by a router or a dependency to produce a specific,
    intentional error response - never used for domain-uncertainty
    cases (the deterministic engine already has its own conservative
    handling for those); this is strictly an HTTP-layer concern."""

    def __init__(
        self,
        status_code: int,
        code: str,
        message: str,
        details: dict[str, Any] | None = None,
    ) -> None:
        self.status_code = status_code
        self.code = code
        self.message = message
        self.details = details
        super().__init__(message)


async def handle_api_error(request: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, APIError)
    body = ErrorResponse(error=ErrorDetail(code=exc.code, message=exc.message, details=exc.details))
    return JSONResponse(status_code=exc.status_code, content=body.model_dump())


async def handle_validation_error(request: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, RequestValidationError)
    body = ErrorResponse(
        error=ErrorDetail(
            code="VALIDATION_ERROR",
            message="Request validation failed",
            details={"errors": jsonable_encoder(exc.errors())},
        )
    )
    return JSONResponse(status_code=422, content=body.model_dump())


async def handle_unexpected_error(request: Request, exc: Exception) -> JSONResponse:
    logger.exception("unhandled exception while serving %s %s", request.method, request.url)
    body = ErrorResponse(
        error=ErrorDetail(code="INTERNAL_ERROR", message="An internal error occurred.")
    )
    return JSONResponse(status_code=500, content=body.model_dump())
