from __future__ import annotations

import httpx

from .conftest import register

HOMEWORK = {
    "title": "Homework",
    "questions": [
        {"type": "truefalse", "text": "Water boils at 100 °C at sea level", "correct": True},
        {"type": "quiz", "text": "2 + 3?", "choices": [{"text": "5", "correct": True}, {"text": "6"}]},
    ],
}


async def test_student_completes_a_self_paced_assignment(client: httpx.AsyncClient) -> None:
    await register(client)
    quiz = (await client.post("/api/quizzes", json=HOMEWORK)).json()
    created = await client.post("/api/assignments", json={"quizId": quiz["id"], "shuffleQuestions": False})
    assert created.status_code == 201, created.text
    assignment = created.json()
    code = assignment["code"]
    assert len(code) == 8
    assert assignment["url"].endswith(f"/a/{code}")

    info = (await client.get(f"/api/play/{code}")).json()
    assert info["title"] == "Homework"
    assert info["questionCount"] == 2
    assert info["open"] is True

    start = (await client.post(f"/api/play/{code}/start", json={"nickname": "Ece"})).json()
    token, question = start["token"], start["question"]
    assert question["index"] == 0
    assert "correct" not in str(question)

    first = (
        await client.post(
            f"/api/play/{code}/answer",
            json={"token": token, "questionIndex": 0, "answer": {"type": "truefalse", "value": True}},
        )
    ).json()
    assert first["correct"] is True
    assert first["finished"] is False
    assert first["points"] > 900

    dup = await client.post(
        f"/api/play/{code}/answer",
        json={"token": token, "questionIndex": 0, "answer": {"type": "truefalse", "value": True}},
    )
    assert dup.status_code == 400
    assert dup.json()["code"] == "already_answered"

    state = (await client.post(f"/api/play/{code}/state", json={"token": token})).json()
    assert state["question"] is None
    nxt = (await client.post(f"/api/play/{code}/next", json={"token": token})).json()
    assert nxt["question"]["index"] == 1
    wrong = next(c for c in nxt["question"]["question"]["choices"] if c["text"] == "6")
    last = (
        await client.post(
            f"/api/play/{code}/answer",
            json={"token": token, "questionIndex": 1, "answer": {"type": "quiz", "choiceId": wrong["id"]}},
        )
    ).json()
    assert last["finished"] is True
    assert last["correct"] is False
    assert last["solution"]["choices"][0]["correct"] is True

    report = (await client.get(f"/api/assignments/{assignment['id']}")).json()
    assert report["completedCount"] == 1
    attempt = report["attempts"][0]
    assert attempt["nickname"] == "Ece"
    assert attempt["correctCount"] == 1
    assert [a["questionIndex"] for a in attempt["answers"]] == [0, 1]

    assert (await client.patch(f"/api/assignments/{assignment['id']}", json={"closed": True})).status_code == 200
    closed = await client.post(f"/api/play/{code}/start", json={"nickname": "Late"})
    assert closed.status_code == 410
    listed = (await client.get("/api/assignments")).json()["items"]
    assert listed[0]["closed"] is True


async def test_rejects_inappropriate_nicknames(client: httpx.AsyncClient) -> None:
    await register(client)
    quiz = (await client.post("/api/quizzes", json=HOMEWORK)).json()
    code = (await client.post("/api/assignments", json={"quizId": quiz["id"]})).json()["code"]
    res = await client.post(f"/api/play/{code}/start", json={"nickname": "sh1t"})
    assert res.json()["code"] == "nickname_inappropriate"
