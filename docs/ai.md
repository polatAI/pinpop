# AI question generation

Pinpop can write quizzes for you from:

- a **topic** or instructions (“Photosynthesis for 7th graders, focus on chloroplasts”)
- pasted **text** (lesson notes, an article…)
- a **web page** URL (fetched server-side; private network addresses are blocked)
- an uploaded **PDF, TXT or Markdown** file

…and improve single questions in the editor (harder / easier / better distractors / explanation / rephrase).

## Providers

| `AI_PROVIDER`       | Notes                                                                          | Default model               |
| ------------------- | ------------------------------------------------------------------------------ | --------------------------- |
| `anthropic`         | Claude via the official Anthropic SDK with structured outputs                  | `claude-opus-5-5`           |
| `openai`            | OpenAI Chat Completions (JSON mode)                                            | `gpt-5-mini`                |
| `openrouter`        | Any model on OpenRouter                                                        | `anthropic/claude-opus-5-5` |
| `ollama`            | Local models, free and offline. Set `AI_BASE_URL` if Ollama isn't on localhost | `llama3.2`                  |
| `openai-compatible` | LM Studio, vLLM, Groq, Together, Mistral… set `AI_BASE_URL`                    | –                           |

Override the model with `AI_MODEL`. For cheaper/faster generation with Claude you can use e.g. `AI_MODEL=claude-sonnet-5-5` or `claude-haiku-5-5`.

### Ollama with Docker

```bash
AI_PROVIDER=ollama
AI_BASE_URL=http://host.docker.internal:11434/v1
AI_MODEL=llama3.1:8b
```

On Linux add `extra_hosts: ["host.docker.internal:host-gateway"]` to the `pinpop` service.

## Server key vs. personal keys

- **Server key** (`AI_PROVIDER` + `AI_API_KEY`): everyone on the instance can generate. Limit usage with `AI_DAILY_LIMIT`.
- **Personal keys** (Settings → AI): each user can configure their own provider. Keys are encrypted with AES-256-GCM using `APP_SECRET`. A personal configuration always takes precedence and is not counted against the daily limit. Disable with `AI_ALLOW_USER_KEYS=false`.

## Quality & safety

- Every generated question is validated against Pinpop's schema; invalid ones are dropped.
- The prompt asks for factual, unambiguous questions with explanations, in the requested language, appropriate for all ages unless an audience is given.
- **Always review AI-generated questions before playing.** Models can make mistakes.

## Privacy

Topics, source texts, fetched pages and uploaded documents are sent to the configured AI provider. Use Ollama if content must not leave your server.
