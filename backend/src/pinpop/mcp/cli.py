"""`pinpop-mcp`: stdio MCP server for Claude Desktop, Cursor and other local MCP clients.

PINPOP_URL=https://quiz.example.com PINPOP_TOKEN=pp_... uvx --from pinpop pinpop-mcp
"""

from __future__ import annotations

import asyncio
import os
import sys
from typing import Any

import httpx
from mcp.server.mcpserver import Context

from .. import __version__
from .tools import ApiRequest, Method, PinpopApiError, create_mcp_server


def http_api(base_url: str, token: str) -> ApiRequest:
    client = httpx.AsyncClient(base_url=base_url, timeout=300, headers={"authorization": f"Bearer {token}"})

    async def request(method: Method, path: str, body: Any = None) -> Any:
        res = await client.request(method, path, json=body)
        data = res.json() if res.content else None
        if res.status_code >= 400:
            info = data if isinstance(data, dict) else {}
            raise PinpopApiError(res.status_code, info.get("code", "error"), info.get("message"))
        return data

    return request


def main() -> None:
    base_url = os.environ.get("PINPOP_URL", "http://localhost:3000").rstrip("/")
    token = os.environ.get("PINPOP_TOKEN")
    if not token:
        print(
            "PINPOP_TOKEN is not set. Create an API token in Pinpop under Settings → API & MCP "
            "and pass it as an environment variable.",
            file=sys.stderr,
        )
        sys.exit(1)
    api = http_api(base_url, token)

    def api_factory(_: Context) -> ApiRequest:
        return api

    server = create_mcp_server(api_factory, version=__version__)
    print(f"Pinpop MCP server connected to {base_url}", file=sys.stderr)
    asyncio.run(server.run_stdio_async())


if __name__ == "__main__":
    main()
