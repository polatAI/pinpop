from __future__ import annotations

from datetime import UTC, datetime


def iso(value: datetime | None) -> str | None:
    """ISO-8601 in UTC with milliseconds and a Z suffix, like JavaScript's toISOString()."""
    if value is None:
        return None
    utc = value.astimezone(UTC) if value.tzinfo else value.replace(tzinfo=UTC)
    return utc.strftime("%Y-%m-%dT%H:%M:%S.") + f"{utc.microsecond // 1000:03d}Z"


def parse_iso(value: str) -> datetime:
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=UTC)
