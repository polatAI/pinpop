from __future__ import annotations

import asyncio
import html
import io
import ipaddress
import re
import socket
from urllib.parse import urljoin, urlsplit

import httpx
from pypdf import PdfReader

from ..errors import bad_request

MAX_SOURCE_CHARS = 60_000
MAX_FETCH_BYTES = 3 * 1024 * 1024
USER_AGENT = "PinpopBot/1.0 (+https://github.com/polatAI/pinpop)"


def _is_private(address: str) -> bool:
    try:
        ip = ipaddress.ip_address(address)
    except ValueError:
        return True
    if isinstance(ip, ipaddress.IPv6Address) and ip.ipv4_mapped:
        ip = ip.ipv4_mapped
    return (
        ip.is_private
        or ip.is_loopback
        or ip.is_link_local
        or ip.is_multicast
        or ip.is_reserved
        or ip.is_unspecified
        or ip in ipaddress.ip_network("100.64.0.0/10")
    )


async def _assert_public_url(raw: str) -> str:
    """Rejects URLs that resolve to private networks so the server can't be used to probe internal services."""
    try:
        parts = urlsplit(raw)
    except ValueError as err:
        raise bad_request("invalid_url") from err
    if parts.scheme not in ("http", "https") or not parts.hostname:
        raise bad_request("invalid_url")
    host = parts.hostname
    try:
        addresses = [str(ipaddress.ip_address(host))]
    except ValueError:
        try:
            infos = await asyncio.to_thread(socket.getaddrinfo, host, None)
        except OSError:
            infos = []
        addresses = [str(info[4][0]) for info in infos]
    if not addresses:
        raise bad_request("url_unreachable")
    if any(_is_private(a) for a in addresses):
        raise bad_request("url_not_allowed")
    return raw


async def fetch_url_text(raw: str) -> str:
    url = await _assert_public_url(raw)
    headers = {"user-agent": USER_AGENT, "accept": "text/html,text/plain,application/pdf"}
    async with httpx.AsyncClient(timeout=15, follow_redirects=False, headers=headers) as client:
        # Follow redirects manually so every hop is checked.
        for _ in range(5):
            try:
                async with client.stream("GET", url) as response:
                    location = response.headers.get("location")
                    if 300 <= response.status_code < 400 and location:
                        url = await _assert_public_url(urljoin(url, location))
                        continue
                    if not response.is_success:
                        raise bad_request("url_unreachable")
                    body = await _read_limited(response, MAX_FETCH_BYTES)
                    content_type = response.headers.get("content-type", "")
            except httpx.HTTPError as err:
                raise bad_request("url_unreachable") from err
            break
        else:
            raise bad_request("url_unreachable")

    if "pdf" in content_type:
        return await extract_pdf_text(body)
    text = body.decode("utf-8", errors="replace")
    if "html" in content_type or re.search(r"<html|<body", text[:2000], re.IGNORECASE):
        return html_to_text(text)
    return _clip_source(text)


async def _read_limited(response: httpx.Response, limit: int) -> bytes:
    chunks: list[bytes] = []
    total = 0
    async for chunk in response.aiter_bytes():
        total += len(chunk)
        if total > limit:
            break
        chunks.append(chunk)
    return b"".join(chunks)


_MAIN = re.compile(r"<(article|main)[\s\S]*?</\1>", re.IGNORECASE)
_NOISE = re.compile(r"<(script|style|noscript|svg|nav|footer|header|form|iframe)[\s\S]*?</\1>", re.IGNORECASE)
_BREAKS = re.compile(r"<br\s*/?>|</(p|div|li|h[1-6]|tr)>", re.IGNORECASE)
_TAGS = re.compile(r"<[^>]+>")


def html_to_text(markup: str) -> str:
    main = _MAIN.search(markup)
    text = main.group(0) if main else markup
    text = _NOISE.sub(" ", text)
    text = _BREAKS.sub("\n", text)
    text = html.unescape(_TAGS.sub(" ", text))
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n\s*\n+", "\n\n", text)
    return _clip_source(text)


def _pdf_text(data: bytes) -> str:
    reader = PdfReader(io.BytesIO(data))
    return "\n".join(page.extract_text() or "" for page in reader.pages)


async def extract_pdf_text(data: bytes) -> str:
    try:
        text = await asyncio.to_thread(_pdf_text, data)
    except Exception as err:
        raise bad_request("unreadable_file") from err
    return _clip_source(text)


async def extract_file_text(data: bytes, filename: str, mimetype: str) -> str:
    lower = filename.lower()
    if mimetype == "application/pdf" or lower.endswith(".pdf"):
        return await extract_pdf_text(data)
    if re.search(r"\.(txt|md|markdown|csv|json|html?)$", lower) or mimetype.startswith("text/"):
        text = data.decode("utf-8", errors="replace")
        return html_to_text(text) if lower.endswith((".html", ".htm")) else _clip_source(text)
    raise bad_request("unsupported_file")


def _clip_source(text: str) -> str:
    cleaned = text.replace("\x00", "").strip()
    if len(cleaned) < 40:
        raise bad_request("source_too_short")
    return cleaned[:MAX_SOURCE_CHARS]
