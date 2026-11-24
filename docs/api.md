# REST API

Interactive OpenAPI documentation is served by every instance at **`/api/docs`** (JSON at `/api/docs/json`).

## Authentication

- **Browser**: session cookie (`pp_session`) set by `/api/auth/login`.
- **Scripts / integrations**: personal API token from _Settings → API & MCP_:

```bash
curl -H "Authorization: Bearer pp_xxx" https://quiz.example.com/api/quizzes
```

## Common endpoints

| Method                 | Path                                                       | Description                                               |
| ---------------------- | ---------------------------------------------------------- | --------------------------------------------------------- |
| `GET`                  | `/api/quizzes`                                             | Your quizzes (`q`, `page`, `pageSize`)                    |
| `POST`                 | `/api/quizzes`                                             | Create a quiz (ids optional)                              |
| `GET/PUT/PATCH/DELETE` | `/api/quizzes/:id`                                         | Read / replace / partial update / delete                  |
| `POST`                 | `/api/quizzes/:id/questions`                               | Append questions                                          |
| `POST`                 | `/api/quizzes/:id/fork`                                    | Copy a quiz into your account                             |
| `GET`                  | `/api/quizzes/:id/export?format=json\|csv`                 | Export                                                    |
| `POST`                 | `/api/quizzes/import`                                      | Import `{ format: "json"\|"csv", content }`               |
| `GET`                  | `/api/discover`                                            | Public library                                            |
| `POST`                 | `/api/ai/generate`                                         | Generate questions (`save: true` stores a quiz)           |
| `POST`                 | `/api/ai/generate-from-file`                               | Same with a PDF/TXT upload (multipart)                    |
| `POST`                 | `/api/ai/improve`                                          | Rewrite one question                                      |
| `POST`                 | `/api/games`                                               | Open a live game → `{ pin, hostToken, hostUrl, joinUrl }` |
| `GET`                  | `/api/games/:pin`                                          | Live status (owner)                                       |
| `POST`                 | `/api/games/:pin/end`                                      | End a live game                                           |
| `GET`                  | `/api/reports`, `/api/reports/:id`, `/api/reports/:id/csv` | Finished game reports                                     |

Errors are JSON: `{ "code": "quiz_not_found", "message": "…" }` with a matching HTTP status.

## Realtime protocol

Live games use Socket.IO on `/socket.io`. Event names and payload types are defined in [`frontend/src/shared/game.ts`](../frontend/src/shared/game.ts) (`ClientToServerEvents`, `ServerToClientEvents`) and handled in [`backend/src/pinpop/game/sockets.py`](../backend/src/pinpop/game/sockets.py). Hosts attach with `host:attach { pin, hostToken }`; players use `player:join` and `player:answer`. The server pushes complete role-specific views (`host:view`, `player:view`) after every change.
