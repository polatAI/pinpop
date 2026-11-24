# Architecture

```
┌────────────── Browser ──────────────┐        ┌──────────────── backend/ (Python) ─────────────────┐
│ frontend/  (React SPA)              │  HTTP  │ FastAPI REST API  ─ auth, quizzes, AI, reports      │
│  · Host screen  /host/:pin          │◄──────►│ python-socketio   ─ GameManager → Game (in memory)  │
│  · Player       /play/:pin          │   WS   │ /mcp              ─ MCP server (Streamable HTTP)    │
│  · Editor, dashboard, reports…      │        │ SQLAlchemy        ─ PostgreSQL or SQLite (Alembic)  │
└─────────────────────────────────────┘        │ AI providers      ─ Anthropic, OpenAI-compatible    │
                                               └─────────────────────────────────────────────────────┘
```

Everything runs in **one process**: `pinpop serve` starts Uvicorn with a single ASGI app that routes `/socket.io` to Socket.IO, `/mcp` to the MCP transport and everything else to FastAPI, which also serves the built web app.

| Path                          | What                                                                     |
| ----------------------------- | ------------------------------------------------------------------------ |
| `backend/src/pinpop/domain`   | Pydantic models for questions and answers, scoring rules, game settings  |
| `backend/src/pinpop/game`     | Game engine (state machine), manager and Socket.IO handlers              |
| `backend/src/pinpop/services` | Auth, quizzes, reports, CSV import/export, homework assignments          |
| `backend/src/pinpop/ai`       | Prompts, provider clients, source extraction (URL, PDF) and the AI schema |
| `backend/src/pinpop/mcp`      | MCP tools, the remote `/mcp` endpoint and the `pinpop-mcp` stdio command |
| `backend/src/pinpop/routes`   | FastAPI routers                                                          |
| `backend/src/pinpop/db`       | SQLAlchemy models and Alembic migrations                                 |
| `frontend/src/shared`         | TypeScript mirror of the wire format (types, Zod schemas, client helpers) |

## Game engine

`backend/src/pinpop/game/engine.py` is a deterministic state machine: `lobby → intro → question → reveal → leaderboard → … → podium`. It is synchronous and takes a clock and an I/O interface, which makes it easy to test without sockets (`tests/test_game.py`).

- **Server authoritative**: answers are validated (`is_answer_well_formed`) and scored (`evaluate_answer` + `compute_points` in `domain/scoring.py`) on the server with server timestamps. Players never receive the solution before the reveal.
- **Views, not deltas**: after every change the server emits a complete, role-specific view (`host:view` / `player:view`). Reconnecting clients simply receive the current view; player identity survives reconnects through a `playerToken`.
- **Throttling**: answer counters for the host are coalesced (200 ms); sockets are rate-limited with a token bucket.
- **Scoring**: correct answers earn up to 1000 points (50 %–100 % depending on speed), ×2 for double-points questions, plus a streak bonus of 100 per consecutive correct answer (max +500). Multi-select, slider and order questions give partial credit.
- **Reports**: when a game reaches the podium (or the host ends it after at least one question) the results are persisted to the `games` table.

## Data

Tables: `users`, `sessions`, `api_tokens`, `quizzes` (questions stored as validated JSON), `games` (report snapshots), `ai_usage`, `assignments`, `assignment_attempts`. JSON columns use `JSONB` on PostgreSQL. Migrations live in `backend/src/pinpop/db/migrations` and are applied automatically at startup (`pinpop migrate` runs them on their own).

## Scaling

Live game state is in memory, which keeps latency tiny and deployment simple. A single instance handles many concurrent games with hundreds of players each; scale vertically. Running several instances would require sticky sessions and a shared game store (e.g. Redis), which is a welcome contribution.

## Security notes

- Passwords: scrypt. Sessions: random 40-char tokens stored as SHA-256 hashes, `HttpOnly` + `SameSite=Lax` cookies.
- API tokens: SHA-256 hashed at rest; cannot mint new tokens.
- Personal AI keys: AES-256-GCM with a key derived from `APP_SECRET`.
- URL fetching for AI blocks private/loopback/link-local networks and re-checks every redirect.
- Uploads are sniffed by magic bytes (images only) and stored under random names.
- Rate limits on auth, AI, uploads, game creation and socket events.
