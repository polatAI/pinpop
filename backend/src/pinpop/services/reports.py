from __future__ import annotations

from typing import Any

from sqlalchemy import delete, func, select

from ..db.database import Database
from ..db.models import Game, Quiz, User
from ..domain.quiz import SCORED_TYPES
from ..errors import forbidden, not_found
from ..game.engine import FinishedGame
from ..security import new_id
from ..util import iso
from .csv_io import write_csv


def _accuracy(row: Game) -> float:
    answered = correct = 0
    for i, q in enumerate(row.questions):
        if q.get("type") not in SCORED_TYPES:
            continue
        for p in row.players:
            answered += 1
            answers = p.get("answers", [])
            if i < len(answers) and answers[i].get("correct"):
                correct += 1
    return correct / answered if answered else 0


def _summary(row: Game) -> dict[str, Any]:
    return {
        "id": row.id,
        "quizId": row.quiz_id,
        "quizTitle": row.quiz_title,
        "pin": row.pin,
        "playerCount": row.player_count,
        "questionCount": len(row.questions),
        "startedAt": iso(row.started_at),
        "endedAt": iso(row.ended_at),
        "averageAccuracy": _accuracy(row),
    }


class ReportService:
    def __init__(self, db: Database) -> None:
        self._db = db

    async def save(self, game: FinishedGame) -> str:
        report_id = new_id(12)
        async with self._db.session() as s, s.begin():
            # The quiz may have been deleted while the game was running.
            quiz_exists = (await s.execute(select(Quiz.id).where(Quiz.id == game.quiz_id))).first() is not None
            s.add(
                Game(
                    id=report_id,
                    quiz_id=game.quiz_id if quiz_exists else None,
                    host_id=game.owner_id,
                    quiz_title=game.quiz_title,
                    pin=game.pin,
                    settings=game.settings.dump(),
                    questions=[q.dump() for q in game.questions],
                    players=game.players,
                    player_count=len(game.players),
                    started_at=game.started_at,
                    ended_at=game.ended_at,
                )
            )
        return report_id

    async def list(self, user: User, page: int, page_size: int) -> dict[str, Any]:
        async with self._db.session() as s:
            rows = (
                await s.execute(
                    select(Game)
                    .where(Game.host_id == user.id)
                    .order_by(Game.started_at.desc())
                    .limit(page_size)
                    .offset((page - 1) * page_size)
                )
            ).scalars()
            items = [_summary(r) for r in rows]
            total = (
                await s.execute(select(func.count()).select_from(Game).where(Game.host_id == user.id))
            ).scalar_one()
        return {"items": items, "total": total, "page": page, "pageSize": page_size}

    async def get(self, report_id: str, user: User) -> dict[str, Any]:
        async with self._db.session() as s:
            row = await s.get(Game, report_id)
        if not row:
            raise not_found("report_not_found")
        if row.host_id != user.id and user.role != "admin":
            raise forbidden()
        return {**_summary(row), "questions": row.questions, "players": row.players}

    async def remove(self, report_id: str, user: User) -> None:
        await self.get(report_id, user)
        async with self._db.session() as s, s.begin():
            await s.execute(delete(Game).where(Game.id == report_id))

    @staticmethod
    def to_csv(report: dict[str, Any]) -> str:
        questions = report["questions"]
        header = [
            "rank",
            "nickname",
            "score",
            "correct",
            *(f"Q{i + 1}: {q['text'][:40]}" for i, q in enumerate(questions)),
        ]
        rows = []
        for p in report["players"]:
            cells: list[Any] = [p["rank"], p["nickname"], p["score"], p["correctCount"]]
            for i in range(len(questions)):
                a = p["answers"][i] if i < len(p["answers"]) else None
                if not a or a.get("timeMs") is None:
                    cells.append("-")
                    continue
                mark = "•" if a["correct"] is None else "✓" if a["correct"] else "✗"
                cells.append(f"{mark} {a['points']}")
            rows.append(cells)
        return "﻿" + write_csv(header, rows)
