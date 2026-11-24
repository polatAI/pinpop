# Contributing to Pinpop

Thanks for helping make Pinpop better! 🎉 Bug reports, translations, docs, design and code are all welcome.

## Development setup

Requirements: Python 3.13 with [uv](https://docs.astral.sh/uv), and Node.js ≥ 22 with pnpm (`npm i -g pnpm`).

```bash
make install
make dev
```

- API + game server (Python, auto-reload): <http://localhost:3000> (OpenAPI at `/api/docs`)
- Web app (Vite, hot reload): <http://localhost:5173>

No database setup is needed: without `DATABASE_URL` the server uses an SQLite file in `backend/data`. To configure things (e.g. `AI_PROVIDER`, `AI_API_KEY`), copy `.env.example` to `.env` in the repository root; it is loaded automatically.

## Project layout

| Path        | What                                                                                       |
| ----------- | ------------------------------------------------------------------------------------------ |
| `backend/`  | Python package `pinpop`: FastAPI, Socket.IO game engine, AI, MCP, SQLAlchemy + Alembic      |
| `frontend/` | React SPA (Vite, Tailwind CSS 4, react-router, TanStack Query, i18next)                    |

See [docs/architecture.md](docs/architecture.md) for a tour of the backend modules.

## Checks

```bash
make lint        # Ruff + Biome. `make format` fixes most issues.
make typecheck   # mypy (strict) + tsc
make test        # pytest: scoring, game engine, API, websockets, MCP, AI
make build
```

CI runs all of these, the backend tests against PostgreSQL, and builds and smoke-tests the Docker image.

## Database changes

Edit `backend/src/pinpop/db/models.py`, then generate a migration and review it:

```bash
cd backend
uv run alembic upgrade head     # brings a scratch SQLite database (data/alembic-dev.db) to the latest schema
uv run alembic revision --autogenerate -m "describe the change"
```

Commit the new file in `backend/src/pinpop/db/migrations/versions/`.

## Translations

UI strings live in `frontend/src/locales/<lang>/{common,game,editor,pages}.json`. To add a language, copy the `en` folder, translate, and register it in `frontend/src/lib/i18n.ts` (`LANGUAGES` and `resources`). Please keep keys identical across languages.

## Adding a question type

1. Add the model to `backend/src/pinpop/domain/quiz.py` and the answer + scoring to `domain/scoring.py` (with tests).
2. Handle public data in `to_public_question` (`domain/helpers.py`) and stats in `Game._compute_stats`.
3. Mirror the types in `frontend/src/shared/` and add the editor, player input and host visualisation in `frontend/`.
4. Teach the AI schema (`backend/src/pinpop/ai/schema.py`) and the MCP tools (`backend/src/pinpop/mcp/tools.py`).

## Pull requests

- Keep PRs focused; describe the _why_.
- Add or update tests for behaviour changes.
- Make sure `make lint typecheck test` passes.
- By contributing you agree that your contributions are licensed under the AGPL-3.0.

## Code of conduct

This project follows our [Code of Conduct](CODE_OF_CONDUCT.md). Be kind.
