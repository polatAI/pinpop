# Security policy

## Reporting a vulnerability

Please **do not open a public issue** for security problems. Use GitHub's **private vulnerability reporting** (Security → Report a vulnerability) on this repository. We aim to acknowledge reports within 3 days and to ship a fix as quickly as possible.

Please include steps to reproduce, the affected version/commit and the impact you observed.

## Supported versions

Security fixes are released for the latest minor version. Self-hosters should keep their image up to date (`docker compose pull && docker compose up -d`).

## Hardening checklist for self-hosters

- Set a strong, stable `APP_SECRET` and serve Pinpop over HTTPS (`PUBLIC_URL=https://…`).
- Set `TRUST_PROXY=true` only when running behind a reverse proxy you control.
- Use `ALLOW_REGISTRATION=false` for private instances.
- Back up your database and `/data` volume regularly.
