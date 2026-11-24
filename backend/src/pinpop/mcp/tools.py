"""MCP tools for Pinpop, shared by the remote `/mcp` endpoint and the `pinpop-mcp` stdio command.

Every tool goes through the regular REST API, so permissions and validation are identical to the web app.
"""

from __future__ import annotations

import json
from collections.abc import Awaitable, Callable
from typing import Annotated, Any, Literal
from urllib.parse import quote, urlencode

from mcp.server.mcpserver import Context, MCPServer
from mcp.server.mcpserver.exceptions import ToolError
from mcp.types import ToolAnnotations
from pydantic import BaseModel, Field

Method = Literal["GET", "POST", "PUT", "PATCH", "DELETE"]
ApiRequest = Callable[[Method, str, Any], Awaitable[Any]]
#: Builds the API caller for one tool call (the remote server forwards the caller's bearer token).
ApiFactory = Callable[[Context], ApiRequest]


class PinpopApiError(Exception):
    def __init__(self, status: int, code: str, message: str | None = None) -> None:
        super().__init__(message or code)
        self.status = status
        self.code = code
        self.message = message or code


INSTRUCTIONS = """Pinpop is an open-source live quiz platform. Use these tools to create quizzes, generate questions with AI, start live games and read results.
Typical flow: create_quiz (write the questions yourself) or generate_quiz (server-side AI) -> start_game -> share the join link/PIN with players and open the host link on a big screen -> get_game_status -> get_report.
Questions do not need ids. Keep question text short (it is read on phones) and give every scored question an explanation."""

QuestionKind = Literal["quiz", "multi", "truefalse", "type", "slider", "order", "poll", "wordcloud"]
Visibility = Literal["private", "unlisted", "public"]


class AgentChoice(BaseModel):
    text: str = Field(max_length=120)
    correct: bool | None = None


class AgentItem(BaseModel):
    text: str


class AgentQuestion(BaseModel):
    """A question written by the agent. Fill only the fields that apply to its type."""

    type: QuestionKind
    text: str = Field(description="Question text (max 500 chars, keep it short for phones)")
    timeLimit: int | None = Field(default=None, ge=5, le=240, description="Seconds to answer, default 20")
    points: Literal["none", "standard", "double"] | None = None
    explanation: str | None = Field(default=None, description="Shown after the answer is revealed")
    image: str | None = Field(default=None, description="Optional https image URL")
    choices: list[AgentChoice] | None = Field(
        default=None, description="quiz (exactly one correct), multi (one or more correct), poll (no correct): 2-6"
    )
    correct: bool | float | None = Field(
        default=None, description="truefalse: whether the statement is true; slider: the correct number"
    )
    acceptedAnswers: list[str] | None = Field(default=None, description="type: 1-10 accepted answers")
    min: float | None = Field(default=None, description="slider: lower bound")
    max: float | None = Field(default=None, description="slider: upper bound")
    step: float | None = None
    tolerance: float | None = None
    unit: str | None = None
    items: list[AgentItem] | None = Field(
        default=None, description="order: 2-6 items in the CORRECT order; players see them shuffled"
    )
    maxLength: int | None = Field(default=None, description="wordcloud: max characters per word")


class GameSettingsInput(BaseModel):
    shuffleQuestions: bool | None = None
    shuffleAnswers: bool | None = None
    autoAdvance: bool | None = None
    randomNicknames: bool | None = None
    showQuestionOnDevices: bool | None = None
    allowLateJoin: bool | None = None


def _questions(items: list[AgentQuestion]) -> list[dict[str, Any]]:
    return [q.model_dump(exclude_none=True) for q in items]


def _json(value: Any) -> str:
    return json.dumps(value, indent=2, ensure_ascii=False)


READ_ONLY = ToolAnnotations(readOnlyHint=True)


def create_mcp_server(api_factory: ApiFactory, *, version: str) -> MCPServer:
    server = MCPServer(name="pinpop", version=version, instructions=INSTRUCTIONS)

    async def call(ctx: Context, method: Method, path: str, body: Any = None) -> Any:
        try:
            return await api_factory(ctx)(method, path, body)
        except PinpopApiError as err:
            raise ToolError(f"Pinpop API error {err.status} ({err.code}): {err.message}") from err

    @server.tool(title="List my quizzes", annotations=READ_ONLY)
    async def list_quizzes(ctx: Context, search: str | None = None, page: Annotated[int, Field(ge=1)] = 1) -> str:
        """Lists the quizzes owned by the authenticated user, newest first."""
        params = {"page": page} | ({"q": search} if search else {})
        return _json(await call(ctx, "GET", f"/api/quizzes?{urlencode(params)}"))

    @server.tool(title="Search public quizzes", annotations=READ_ONLY)
    async def discover_quizzes(
        ctx: Context, search: str | None = None, tag: str | None = None, language: str | None = None
    ) -> str:
        """Searches the public quiz library of this Pinpop instance."""
        params = {"sort": "popular", "q": search, "tag": tag, "language": language}
        query = urlencode({k: v for k, v in params.items() if v})
        return _json(await call(ctx, "GET", f"/api/discover?{query}"))

    @server.tool(title="Get quiz", annotations=READ_ONLY)
    async def get_quiz(ctx: Context, quizId: str) -> str:
        """Returns a quiz with all of its questions and answers."""
        return _json(await call(ctx, "GET", f"/api/quizzes/{quote(quizId, safe='')}"))

    @server.tool(title="Create quiz")
    async def create_quiz(
        ctx: Context,
        title: Annotated[str, Field(max_length=120)],
        questions: Annotated[list[AgentQuestion], Field(min_length=1, max_length=100)],
        description: Annotated[str, Field(max_length=1000)] = "",
        language: Annotated[str, Field(description="ISO code such as en or tr")] = "en",
        visibility: Visibility = "private",
        tags: Annotated[list[str], Field(max_length=10)] | None = None,
    ) -> str:
        """Creates a new quiz from questions you write.

        Mix question types for fun games: quiz (single answer), multi, truefalse, type (typed answer),
        slider (number estimate), order, poll, wordcloud.
        """
        body = {
            "title": title,
            "description": description,
            "language": language,
            "visibility": visibility,
            "tags": tags or [],
            "questions": _questions(questions),
        }
        quiz = await call(ctx, "POST", "/api/quizzes", body)
        return _json({"id": quiz["id"], "title": quiz["title"], "questionCount": len(quiz["questions"])})

    @server.tool(title="Add questions")
    async def add_questions(
        ctx: Context, quizId: str, questions: Annotated[list[AgentQuestion], Field(min_length=1, max_length=100)]
    ) -> str:
        """Appends questions to an existing quiz."""
        quiz = await call(
            ctx, "POST", f"/api/quizzes/{quote(quizId, safe='')}/questions", {"questions": _questions(questions)}
        )
        return _json({"id": quiz["id"], "questionCount": len(quiz["questions"])})

    @server.tool(title="Update quiz")
    async def update_quiz(
        ctx: Context,
        quizId: str,
        title: Annotated[str, Field(max_length=120)] | None = None,
        description: Annotated[str, Field(max_length=1000)] | None = None,
        language: str | None = None,
        visibility: Visibility | None = None,
        tags: Annotated[list[str], Field(max_length=10)] | None = None,
        questions: Annotated[list[dict[str, Any]], Field(max_length=100)] | None = None,
    ) -> str:
        """Updates quiz fields. Passing `questions` replaces ALL questions, so call get_quiz first and send the full edited list."""
        patch = {
            "title": title,
            "description": description,
            "language": language,
            "visibility": visibility,
            "tags": tags,
            "questions": questions,
        }
        quiz = await call(
            ctx, "PATCH", f"/api/quizzes/{quote(quizId, safe='')}", {k: v for k, v in patch.items() if v is not None}
        )
        return _json({"id": quiz["id"], "questionCount": len(quiz["questions"])})

    @server.tool(title="Delete quiz", annotations=ToolAnnotations(destructiveHint=True))
    async def delete_quiz(ctx: Context, quizId: str) -> str:
        """Permanently deletes a quiz. Ask the user for confirmation first."""
        return _json(await call(ctx, "DELETE", f"/api/quizzes/{quote(quizId, safe='')}"))

    @server.tool(title="Generate quiz with AI")
    async def generate_quiz(
        ctx: Context,
        topic: str | None = None,
        sourceText: str | None = None,
        sourceUrl: Annotated[str, Field(pattern=r"^https?://")] | None = None,
        count: Annotated[int, Field(ge=1, le=30)] = 10,
        difficulty: Literal["easy", "medium", "hard", "mixed"] = "medium",
        language: str = "en",
        types: list[QuestionKind] | None = None,
    ) -> str:
        """Uses the AI provider configured on the Pinpop server to generate and save a quiz from a topic, text or web page.

        Prefer create_quiz if you can write the questions yourself.
        """
        body = {
            "topic": topic,
            "sourceText": sourceText,
            "sourceUrl": sourceUrl,
            "count": count,
            "difficulty": difficulty,
            "language": language,
            "types": types,
            "save": True,
        }
        res = await call(ctx, "POST", "/api/ai/generate", {k: v for k, v in body.items() if v is not None})
        return _json(
            {"quizId": res["quizId"], "title": res["quiz"]["title"], "questionCount": len(res["quiz"]["questions"])}
        )

    @server.tool(title="Start live game")
    async def start_game(ctx: Context, quizId: str, settings: GameSettingsInput | None = None) -> str:
        """Opens a live game lobby for a quiz.

        Returns a PIN, a join link for players and a private host link that must be opened in a browser
        (e.g. on a projector) to run the game.
        """
        body: dict[str, Any] = {"quizId": quizId}
        if settings:
            body["settings"] = settings.model_dump(exclude_none=True)
        game = await call(ctx, "POST", "/api/games", body)
        return _json(
            {
                "pin": game["pin"],
                "joinUrl": game["joinUrl"],
                "hostUrl": game["hostUrl"],
                "note": "Open hostUrl in a browser to control the game. Players join at joinUrl or by entering the PIN.",
            }
        )

    @server.tool(title="Live game status", annotations=READ_ONLY)
    async def get_game_status(ctx: Context, pin: str) -> str:
        """Returns the phase, players and leaderboard of a live game you host."""
        return _json(await call(ctx, "GET", f"/api/games/{quote(''.join(pin.split()), safe='')}"))

    @server.tool(title="List game reports", annotations=READ_ONLY)
    async def list_reports(ctx: Context, page: Annotated[int, Field(ge=1)] = 1) -> str:
        """Lists finished games with player counts and average accuracy."""
        return _json(await call(ctx, "GET", f"/api/reports?page={page}"))

    @server.tool(title="Get game report", annotations=READ_ONLY)
    async def get_report(ctx: Context, reportId: str) -> str:
        """Returns the full results of a finished game: every player's answers, scores and ranks."""
        return _json(await call(ctx, "GET", f"/api/reports/{quote(reportId, safe='')}"))

    return server
