# Developer shortcuts. Requirements: uv (Python) and pnpm (Node.js 22+).

.PHONY: install dev backend frontend test lint format typecheck build

install:
	cd backend && uv sync
	cd frontend && pnpm install

# API + game server on :3000 and the web app with hot reload on http://localhost:5173
dev:
	@$(MAKE) -j2 backend frontend

backend:
	cd backend && PUBLIC_URL=$${PUBLIC_URL:-http://localhost:5173} uv run pinpop serve --reload

frontend:
	cd frontend && pnpm dev

test:
	cd backend && uv run pytest

lint:
	cd backend && uv run ruff check src tests && uv run ruff format --check src tests
	cd frontend && pnpm lint

format:
	cd backend && uv run ruff check --fix src tests && uv run ruff format src tests
	cd frontend && pnpm format

typecheck:
	cd backend && uv run mypy src
	cd frontend && pnpm typecheck

build:
	cd frontend && pnpm build
