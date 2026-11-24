# pinpop (backend)

Python package behind [Pinpop](https://github.com/polatAI/pinpop), the open-source live quiz platform:
FastAPI REST API, Socket.IO game engine, AI question generation and an MCP server.

```bash
uv sync
uv run pinpop serve          # http://localhost:3000, OpenAPI docs at /api/docs
uv run pinpop migrate        # apply database migrations and exit
uv run pinpop-mcp            # stdio MCP server (needs PINPOP_URL and PINPOP_TOKEN)
uv run pytest                # tests
```

Configuration is read from environment variables and `.env` (see the repository's `.env.example`).
License: AGPL-3.0-or-later.
