from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, File, UploadFile

from ..deps import Ctx, CurrentUser, rate_limit
from ..errors import HttpError, bad_request
from ..security import random_token

router = APIRouter(tags=["uploads"])


def sniff_image(data: bytes) -> str | None:
    """Detects the image type from magic bytes instead of trusting the client-provided content type."""
    if len(data) < 12:
        return None
    if data[:4] == b"\x89PNG":
        return "png"
    if data[:3] == b"\xff\xd8\xff":
        return "jpg"
    if data[:3] == b"GIF":
        return "gif"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "webp"
    if data[4:12] == b"ftypavif":
        return "avif"
    return None


@router.post("/api/uploads", status_code=201, dependencies=[Depends(rate_limit(30))])
async def upload_image(file: Annotated[UploadFile, File()], _: CurrentUser, ctx: Ctx) -> dict[str, str]:
    limit = int(ctx.settings.UPLOAD_MAX_MB * 1024 * 1024)
    data = await file.read(limit + 1)
    if len(data) > limit:
        raise HttpError(413, "file_too_large")
    ext = sniff_image(data)
    if not ext:
        raise bad_request("unsupported_image")
    name = f"{random_token(20)}.{ext}"
    (ctx.settings.uploads_dir / name).write_bytes(data)
    return {"url": f"/uploads/{name}"}
