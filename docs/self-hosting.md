# Self-hosting Pinpop

Pinpop ships as a single Docker image (`ghcr.io/polatai/pinpop`) that contains the API, the realtime game server and the web app.

## Requirements

- Docker (or Python 3.13 with [uv](https://docs.astral.sh/uv) and Node.js ≥ 22 with pnpm if you run from source)
- 512 MB RAM is plenty for a classroom; 1 GB+ for hundreds of concurrent players
- Optional: PostgreSQL 14+ (otherwise an SQLite file in the data volume is used)

## Docker Compose (recommended)

```bash
git clone https://github.com/polatAI/pinpop.git && cd pinpop
cp .env.example .env
# edit .env: PUBLIC_URL, APP_SECRET (openssl rand -hex 32), POSTGRES_PASSWORD
docker compose up -d
docker compose logs -f pinpop
```

The first account that registers becomes the **admin**. If you want a private instance, set `ALLOW_REGISTRATION=false` _after_ creating your account.

## Single container

```bash
docker run -d --name pinpop -p 3000:3000 -v pinpop-data:/data \
  -e PUBLIC_URL=https://quiz.example.com \
  -e APP_SECRET=$(openssl rand -hex 32) \
  -e TRUST_PROXY=true \
  ghcr.io/polatai/pinpop:latest
```

Without `DATABASE_URL`, Pinpop stores everything (database, uploads, secret) in `/data`.

## From source (without Docker)

```bash
cd frontend && pnpm install && pnpm build && cd ..
cd backend && uv sync --no-dev
PUBLIC_URL=https://quiz.example.com WEB_DIST=../frontend/dist uv run pinpop serve
```

Run it under systemd or another process manager. `uv run pinpop migrate` applies database migrations without starting the server.

## Reverse proxy

Pinpop uses WebSockets (`/socket.io`). Make sure your proxy forwards upgrades, and set `TRUST_PROXY=true` and `PUBLIC_URL=https://…`.

**Caddy**

```caddy
quiz.example.com {
  reverse_proxy localhost:3000
}
```

**nginx**

```nginx
server {
  server_name quiz.example.com;
  client_max_body_size 20m;
  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 3600s;
  }
}
```

## Platforms

- **Render**: the repository contains a [`render.yaml`](../render.yaml) blueprint (web service + PostgreSQL). Click _New → Blueprint_ and select your fork.
- **Railway**: create a project from your fork, add a PostgreSQL plugin and set `DATABASE_URL=${{Postgres.DATABASE_URL}}`, `PUBLIC_URL`, `APP_SECRET`, `TRUST_PROXY=true`.
- **Coolify / Dokploy / CapRover**: deploy `docker-compose.yml` directly.
- **Fly.io**: `fly launch` detects the Dockerfile; mount a volume at `/data` or attach Postgres.

> Live games are kept in memory, so run **one instance** per deployment (scale vertically). See [architecture.md](architecture.md#scaling).

## Backups

- **PostgreSQL**: `docker compose exec db pg_dump -U pinpop pinpop > backup.sql`
- **SQLite database / uploads**: back up the `/data` volume (stop the container first for a consistent copy of `pinpop.db`).

## Upgrading

```bash
docker compose pull && docker compose up -d
```

Database migrations run automatically on start.

## Health check

`GET /api/health` returns `{ "status": "ok" }`. The Docker image has a built-in `HEALTHCHECK`.
