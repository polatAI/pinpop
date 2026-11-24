from __future__ import annotations


class HttpError(Exception):
    """An expected API error; rendered as `{"code": ..., "message": ...}` with the given status."""

    def __init__(self, status: int, code: str, message: str | None = None) -> None:
        super().__init__(message or code)
        self.status = status
        self.code = code
        self.message = message or code


def bad_request(code: str = "bad_request", message: str | None = None) -> HttpError:
    return HttpError(400, code, message)


def unauthorized(code: str = "unauthorized") -> HttpError:
    return HttpError(401, code)


def forbidden(code: str = "forbidden") -> HttpError:
    return HttpError(403, code)


def not_found(code: str = "not_found") -> HttpError:
    return HttpError(404, code)


def conflict(code: str = "conflict") -> HttpError:
    return HttpError(409, code)


def too_many_requests(code: str = "rate_limited") -> HttpError:
    return HttpError(429, code)
