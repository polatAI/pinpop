"""Remote MCP endpoint (Streamable HTTP, stateless) mounted at `/mcp`.

Clients authenticate with `Authorization: Bearer pp_…`; tool calls are routed through the REST API in-process.
"""

from __future__ import annotations

import json
from typing import Any

import httpx
from mcp.server.mcpserver import Context, MCPServer
from mcp.server.transport_security import TransportSecuritySettings
from starlette.types import ASGIApp, Receive, Scope, Send

from ..services.auth import AuthService
from .tools import ApiRequest, Method, PinpopApiError, create_mcp_server


def in_process_api(app: ASGIApp, authorization: str) -> ApiRequest:
    async def request(method: Method, path: str, body: Any = None) -> Any:
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://pinpop.internal", timeout=300) as client:
            res = await client.request(method, path, json=body, headers={"authorization": authorization})
        data = res.json() if res.content else None
        if res.status_code >= 400:
            info = data if isinstance(data, dict) else {}
            raise PinpopApiError(res.status_code, info.get("code", "error"), info.get("message"))
        return data

    return request


class McpEndpoint:
    """ASGI app that checks the API token before handing the request to the MCP transport."""

    def __init__(self, api_app: ASGIApp, auth: AuthService, version: str) -> None:
        def api_factory(ctx: Context) -> ApiRequest:
            headers = ctx.headers or {}
            return in_process_api(api_app, headers.get("authorization", ""))

        self.server: MCPServer = create_mcp_server(api_factory, version=version)
        self._transport = self.server.streamable_http_app(
            streamable_http_path="/mcp",
            json_response=True,
            stateless_http=True,
            # Requests carry a bearer token (never cookies), so DNS rebinding can't borrow a session.
            transport_security=TransportSecuritySettings(enable_dns_rebinding_protection=False),
        )
        self._auth = auth

    @property
    def session_manager(self) -> Any:
        return self.server.session_manager

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self._transport(scope, receive, send)
            return
        if scope["method"] != "POST":
            body = {"jsonrpc": "2.0", "error": {"code": -32000, "message": "Method not allowed."}, "id": None}
            await _json_response(send, 405, body)
            return
        headers = {k.decode().lower(): v.decode() for k, v in scope["headers"]}
        authorization = headers.get("authorization", "")
        user = (
            await self._auth.user_for_token(authorization[7:].strip()) if authorization.startswith("Bearer ") else None
        )
        if user is None:
            body = {"code": "unauthorized", "message": "Use an API token: Authorization: Bearer pp_…"}
            await _json_response(send, 401, body, {"www-authenticate": 'Bearer realm="pinpop"'})
            return
        await self._transport({**scope, "path": "/mcp", "root_path": ""}, receive, send)


async def _json_response(send: Send, status: int, body: dict[str, Any], extra: dict[str, str] | None = None) -> None:
    payload = json.dumps(body).encode()
    headers = [(b"content-type", b"application/json"), (b"content-length", str(len(payload)).encode())]
    headers += [(k.encode(), v.encode()) for k, v in (extra or {}).items()]
    await send({"type": "http.response.start", "status": status, "headers": headers})
    await send({"type": "http.response.body", "body": payload})
