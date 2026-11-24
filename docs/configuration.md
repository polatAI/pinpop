# Configuration

All configuration is done with environment variables (see [`.env.example`](../.env.example)).

| Variable                                    | Default                  | Description                                                                                                                       |
| ------------------------------------------- | ------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| `PUBLIC_URL`                                | `http://localhost:$PORT` | Public address. Used for links, QR codes, OAuth callbacks and secure cookies (`https://` enables `Secure` cookies).               |
| `APP_SECRET`                                | generated                | Encrypts stored AI keys. Generated once into `DATA_DIR/.secret` if empty. **Set it explicitly in production** and keep it stable. |
| `INSTANCE_NAME`                             | `Pinpop`                 | Name shown in the UI.                                                                                                             |
| `PORT` / `HOST`                             | `3000` / `0.0.0.0`       | Listen address.                                                                                                                   |
| `TRUST_PROXY`                               | `false`                  | Trust `X-Forwarded-*` headers (behind a reverse proxy).                                                                           |
| `LOG_LEVEL`                                 | `info`                   | `critical`, `error`, `warning`, `info`, `debug`.                                                                                  |
| `DATABASE_URL`                              | –                        | PostgreSQL URL (`postgres://…`). Empty → SQLite file `DATA_DIR/pinpop.db`.                                                        |
| `DATA_DIR`                                  | `./data`                 | Uploads, embedded DB and generated secret.                                                                                        |
| `UPLOAD_MAX_MB`                             | `5`                      | Max image / document upload size.                                                                                                 |
| `ALLOW_REGISTRATION`                        | `true`                   | Allow new sign-ups. The very first account can always be created.                                                                 |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | –                        | Enable “Sign in with GitHub”. Callback: `{PUBLIC_URL}/api/auth/oauth/github/callback`.                                            |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | –                        | Enable “Sign in with Google”. Callback: `{PUBLIC_URL}/api/auth/oauth/google/callback`.                                            |
| `MAX_PLAYERS`                               | `500`                    | Maximum players per game.                                                                                                         |
| `MAX_GAMES`                                 | `1000`                   | Maximum simultaneous live games.                                                                                                  |
| `AI_PROVIDER`                               | –                        | `anthropic`, `openai`, `openrouter`, `ollama`, `openai-compatible`. Empty disables server-wide AI.                                |
| `AI_API_KEY`                                | –                        | Key for the provider above.                                                                                                       |
| `AI_MODEL`                                  | per provider             | Model name override.                                                                                                              |
| `AI_BASE_URL`                               | per provider             | Custom endpoint (required for `openai-compatible`; Ollama defaults to `http://localhost:11434/v1`).                               |
| `AI_ALLOW_USER_KEYS`                        | `true`                   | Let users configure their own AI provider/key (encrypted at rest).                                                                |
| `AI_DAILY_LIMIT`                            | `0`                      | AI generations per user per day with the server key (`0` = unlimited). Personal keys are never limited.                           |
| `HOSTED_MODE`                               | `false`                  | Marks the instance as a public hosted service.                                                                                    |
