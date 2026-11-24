# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [0.1.0] - 2026-11-25

### Added

- Live games with PIN/QR join, host and player screens, speed scoring, streaks, leaderboard and podium.
- Homework mode: self-paced assignments via share link with deadlines, per-student results and CSV export.
- Eight question types: quiz, multiple select, true/false, type answer, slider, order, poll, word cloud.
- Quiz editor with drag-and-drop, images, time limits, double points and explanations.
- AI generation from topic, text, URL and PDF with Anthropic, OpenAI, OpenRouter, Ollama and OpenAI-compatible providers; question improvement actions; bring-your-own-key.
- Remote MCP endpoint (`/mcp`) and the `pinpop-mcp` stdio command.
- REST API with OpenAPI docs and personal API tokens.
- Reports with per-question and per-player breakdowns and CSV export.
- JSON and CSV import/export, public library with forking.
- Email/password and optional GitHub/Google login, admin panel, data export and account deletion.
- Python backend (FastAPI, python-socketio, SQLAlchemy, Alembic) and React frontend.
- Docker image, docker-compose with PostgreSQL, zero-setup SQLite fallback.
- English and Turkish UI, dark mode, PWA manifest.
