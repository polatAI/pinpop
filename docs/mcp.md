# MCP: use Pinpop from AI assistants

Pinpop speaks the [Model Context Protocol](https://modelcontextprotocol.io), so assistants like Claude, Cursor or any MCP client can create quizzes, start games and read results for you.

> _“Create a 12-question quiz about the Ottoman Empire for high-school students, mix true/false and slider questions, then start a game.”_

## 1. Create an API token

In Pinpop open **Settings → API & MCP → Create token**. Tokens start with `pp_` and act on behalf of your account. Revoke them any time.

## 2a. Remote server (no install)

Every Pinpop instance exposes a Streamable-HTTP MCP endpoint at `https://<your-pinpop>/mcp`, authenticated with `Authorization: Bearer <token>`.

**Claude Code**

```bash
claude mcp add --transport http pinpop https://quiz.example.com/mcp \
  --header "Authorization: Bearer pp_xxx"
```

Any client that supports remote MCP servers with custom headers works the same way.

## 2b. Local stdio server

The `pinpop-mcp` command ships with the Python package. With [uv](https://docs.astral.sh/uv) installed, clients can run it straight from GitHub:

```json
{
  "mcpServers": {
    "pinpop": {
      "command": "uvx",
      "args": ["--from", "git+https://github.com/polatAI/pinpop#subdirectory=backend", "pinpop-mcp"],
      "env": {
        "PINPOP_URL": "https://quiz.example.com",
        "PINPOP_TOKEN": "pp_xxx"
      }
    }
  }
}
```

- **Claude Desktop**: Settings → Developer → Edit config (`claude_desktop_config.json`)
- **Cursor**: `~/.cursor/mcp.json` or project `.cursor/mcp.json`
- **Windsurf / Cline / Zed / VS Code**: add the same command in their MCP settings

## Tools

| Tool                          | What it does                                                              |
| ----------------------------- | ------------------------------------------------------------------------- |
| `list_quizzes`                | Your quizzes (search, pagination)                                         |
| `discover_quizzes`            | Search the public library                                                 |
| `get_quiz`                    | A quiz with all questions and answers                                     |
| `create_quiz`                 | Create a quiz from questions the assistant writes (no server AI needed)   |
| `add_questions`               | Append questions to a quiz                                                |
| `update_quiz`                 | Change title, description, visibility, tags or replace questions          |
| `delete_quiz`                 | Delete a quiz (destructive)                                               |
| `generate_quiz`               | Generate & save a quiz with the server's AI provider (topic, text or URL) |
| `start_game`                  | Open a live lobby → returns PIN, player join link and private host link   |
| `get_game_status`             | Phase, players and leaderboard of a live game                             |
| `list_reports` / `get_report` | Results of finished games                                                 |

Question objects don't need ids. Example `create_quiz` input:

```json
{
  "title": "Space basics",
  "language": "en",
  "questions": [
    {
      "type": "quiz",
      "text": "Which planet is the largest?",
      "choices": [
        { "text": "Jupiter", "correct": true },
        { "text": "Saturn" },
        { "text": "Neptune" },
        { "text": "Earth" }
      ],
      "explanation": "Jupiter is more than twice as massive as all other planets combined."
    },
    { "type": "truefalse", "text": "The Sun is a star.", "correct": true },
    { "type": "slider", "text": "How many moons does Mars have?", "min": 0, "max": 10, "correct": 2 }
  ]
}
```

The host link returned by `start_game` contains a secret token. Open it in a browser (e.g. on the classroom projector) to run the game.
