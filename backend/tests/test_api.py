from __future__ import annotations

import asyncio
import json
from collections.abc import Callable
from typing import Any

import httpx
import socketio

from pinpop.app import Pinpop

from .conftest import live_server, register, running

SAMPLE_QUIZ = {
    "title": "Capitals",
    "visibility": "public",
    "tags": ["Geography"],
    "questions": [
        {
            "type": "quiz",
            "text": "Capital of Türkiye?",
            "choices": [{"text": "Ankara", "correct": True}, {"text": "İstanbul"}],
        },
        {"type": "truefalse", "text": "Paris is in France", "correct": True},
    ],
}


async def test_registers_first_user_as_admin_and_rejects_bad_credentials(client: httpx.AsyncClient) -> None:
    user = await register(client, email="ADA@example.com")
    assert user["email"] == "ada@example.com"
    assert user["role"] == "admin"
    me = await client.get("/api/auth/me")
    assert me.json()["user"]["name"] == "Ada"

    bad = await client.post("/api/auth/login", json={"email": "ada@example.com", "password": "wrong-password"})
    assert bad.status_code == 401
    assert bad.json()["code"] == "invalid_credentials"
    dup = await client.post("/api/auth/register", json={"name": "Ada", "email": "ada@example.com", "password": "x" * 8})
    assert dup.status_code == 409
    good = await client.post("/api/auth/login", json={"email": "ada@example.com", "password": "supersecret"})
    assert good.status_code == 200

    second = httpx.AsyncClient(transport=client._transport, base_url=str(client.base_url))
    async with second:
        assert (await register(second, "Grace", "grace@example.com"))["role"] == "user"


async def test_creates_lists_updates_exports_and_imports_quizzes(client: httpx.AsyncClient) -> None:
    await register(client)
    created = await client.post("/api/quizzes", json=SAMPLE_QUIZ)
    assert created.status_code == 201, created.text
    quiz = created.json()
    assert len(quiz["questions"]) == 2
    assert quiz["questions"][0]["id"]
    assert quiz["tags"] == ["geography"]

    assert (await client.get("/api/quizzes")).json()["total"] == 1
    discover = await client.get("/api/discover", params={"q": "capit"})
    assert discover.json()["items"][0]["id"] == quiz["id"]
    by_tag = await client.get("/api/discover", params={"tag": "geography"})
    assert by_tag.json()["total"] == 1
    assert (await client.get("/api/discover", params={"tag": "history"})).json()["total"] == 0

    patched = await client.patch(f"/api/quizzes/{quiz['id']}", json={"title": "World capitals"})
    assert patched.json()["title"] == "World capitals"

    csv_text = (await client.get(f"/api/quizzes/{quiz['id']}/export", params={"format": "csv"})).text
    assert "Capital of Türkiye?" in csv_text
    imported = await client.post(
        "/api/quizzes/import", json={"format": "csv", "content": csv_text, "title": "From CSV"}
    )
    assert imported.status_code == 201, imported.text
    assert len(imported.json()["questions"]) == 2
    assert imported.json()["questions"][0]["choices"][0]["correct"] is True

    exported = (await client.get(f"/api/quizzes/{quiz['id']}/export")).json()
    again = await client.post("/api/quizzes/import", json={"format": "json", "content": json.dumps(exported)})
    assert again.json()["title"] == "World capitals"

    fork = await client.post(f"/api/quizzes/{quiz['id']}/fork")
    assert fork.json()["title"] == "World capitals (copy)"
    assert fork.json()["forkedFrom"] == quiz["id"]


async def test_rejects_invalid_quizzes_and_protects_private_ones(client: httpx.AsyncClient) -> None:
    anon = await client.get("/api/quizzes")
    assert anon.status_code == 401
    await register(client)
    bad = await client.post(
        "/api/quizzes",
        json={
            "title": "Bad",
            "questions": [{"type": "quiz", "text": "No correct", "choices": [{"text": "a"}, {"text": "b"}]}],
        },
    )
    assert bad.status_code == 400
    assert bad.json()["code"] == "invalid_quiz"
    assert "At least one choice must be correct" in bad.json()["message"]

    private = (await client.post("/api/quizzes", json={**SAMPLE_QUIZ, "visibility": "private"})).json()
    await client.post("/api/auth/logout")
    assert (await client.get(f"/api/quizzes/{private['id']}")).status_code == 404


async def test_api_tokens_work_as_bearer_auth(client: httpx.AsyncClient) -> None:
    await register(client)
    token = (await client.post("/api/me/tokens", json={"name": "Claude"})).json()["token"]
    assert token.startswith("pp_")
    client.cookies.clear()
    headers = {"authorization": f"Bearer {token}"}
    assert (await client.get("/api/quizzes", headers=headers)).status_code == 200
    mint = await client.post("/api/me/tokens", headers=headers, json={"name": "nope"})
    assert mint.status_code == 401
    assert (await client.get("/api/quizzes", headers={"authorization": "Bearer pp_wrong"})).status_code == 401


async def test_reports_ai_as_unavailable_when_not_configured(client: httpx.AsyncClient) -> None:
    await register(client)
    res = await client.post("/api/ai/generate", json={"topic": "Space"})
    assert res.status_code == 503
    assert res.json()["code"] == "ai_unavailable"


async def test_account_settings_and_admin(client: httpx.AsyncClient) -> None:
    await register(client)
    assert (await client.patch("/api/me", json={"name": "Ada L."})).json()["user"]["name"] == "Ada L."
    saved = await client.put("/api/me/ai", json={"provider": "anthropic", "apiKey": "sk-ant-test"})
    assert saved.status_code == 200
    ai = (await client.get("/api/me/ai")).json()
    assert ai["settings"] == {"provider": "anthropic", "model": None, "baseUrl": None, "hasKey": True}
    assert ai["status"]["source"] == "user"
    stats = (await client.get("/api/admin/stats")).json()
    assert stats["users"] == 1
    assert (await client.get("/api/instance")).json()["registrationOpen"] is True
    export = await client.get("/api/me/export")
    assert "attachment" in export.headers["content-disposition"]
    deleted = await client.request("DELETE", "/api/me", json={"confirm": "DELETE"})
    assert deleted.status_code == 200
    assert (await client.get("/api/auth/me")).json()["user"] is None


async def _mcp(
    client: httpx.AsyncClient, token: str, method: str, params: dict[str, Any], id_: int = 1
) -> httpx.Response:
    return await client.post(
        "/mcp",
        headers={"authorization": f"Bearer {token}", "accept": "application/json, text/event-stream"},
        json={"jsonrpc": "2.0", "id": id_, "method": method, "params": params},
    )


async def test_serves_the_mcp_endpoint_with_tools(client: httpx.AsyncClient) -> None:
    await register(client)
    token = (await client.post("/api/me/tokens", json={"name": "MCP"})).json()["token"]
    client.cookies.clear()
    unauth = await client.post("/mcp", json={})
    assert unauth.status_code == 401

    init = await _mcp(
        client,
        token,
        "initialize",
        {"protocolVersion": "2025-06-18", "capabilities": {}, "clientInfo": {"name": "test", "version": "1"}},
    )
    assert init.status_code == 200, init.text

    tools = await _mcp(client, token, "tools/list", {}, 2)
    names = {t["name"] for t in tools.json()["result"]["tools"]}
    assert {"create_quiz", "start_game", "get_report"} <= names

    call = await _mcp(
        client,
        token,
        "tools/call",
        {
            "name": "create_quiz",
            "arguments": {
                "title": "From MCP",
                "questions": [{"type": "truefalse", "text": "MCP works", "correct": True}],
            },
        },
        3,
    )
    result = call.json()["result"]
    assert not result.get("isError"), result
    assert json.loads(result["content"][0]["text"])["questionCount"] == 1

    failing = await _mcp(client, token, "tools/call", {"name": "get_quiz", "arguments": {"quizId": "missing"}}, 4)
    assert failing.json()["result"]["isError"] is True
    assert "quiz_not_found" in failing.json()["result"]["content"][0]["text"]


async def wait_for(check: Callable[[], bool], timeout: float = 5) -> None:
    for _ in range(int(timeout / 0.02)):
        if check():
            return
        await asyncio.sleep(0.02)
    assert check()


async def test_plays_a_live_game_over_websockets_and_stores_a_report(app: Pinpop) -> None:
    async with live_server(app) as base_url, httpx.AsyncClient(base_url=base_url) as http:
        await register(http)
        quiz = (await http.post("/api/quizzes", json=SAMPLE_QUIZ)).json()
        created = await http.post("/api/games", json={"quizId": quiz["id"], "settings": {"readSeconds": 0}})
        assert created.status_code == 201, created.text
        pin, host_token = created.json()["pin"], created.json()["hostToken"]
        assert (await http.get(f"/api/games/{pin}/exists")).json()["exists"] is True

        host, player = socketio.AsyncClient(), socketio.AsyncClient()
        host_views: list[dict[str, Any]] = []
        player_views: list[dict[str, Any]] = []
        host.on("host:view", host_views.append)
        player.on("player:view", player_views.append)
        await host.connect(base_url, transports=["websocket"])
        await player.connect(base_url, transports=["websocket"])
        try:
            assert (await host.call("host:attach", {"pin": pin, "hostToken": host_token}))["ok"] is True
            wrong = await host.call("host:attach", {"pin": pin, "hostToken": "wrong"})
            assert wrong == {"ok": False, "error": "not_allowed"}
            joined = await player.call("player:join", {"pin": pin, "nickname": "Grace"})
            assert joined["ok"] is True
            await wait_for(lambda: bool(host_views) and len(host_views[-1]["players"]) == 1)

            assert (await host.call("host:start"))["ok"] is True
            await wait_for(lambda: bool(player_views) and player_views[-1]["phase"] == "question")
            ankara = next(c for c in player_views[-1]["question"]["choices"] if c["text"] == "Ankara")
            res = await player.call(
                "player:answer", {"questionIndex": 0, "answer": {"type": "quiz", "choiceId": ankara["id"]}}
            )
            assert res == {"ok": True, "data": None}
            await wait_for(lambda: player_views[-1]["phase"] == "reveal")
            assert player_views[-1]["result"]["correct"] is True

            await host.call("host:next")  # leaderboard
            await host.call("host:next")  # question 2
            await wait_for(lambda: player_views[-1]["phase"] == "question" and player_views[-1]["questionIndex"] == 1)
            await player.call("player:answer", {"questionIndex": 1, "answer": {"type": "truefalse", "value": False}})
            await wait_for(lambda: player_views[-1]["phase"] == "reveal")
            await host.call("host:next")  # podium
            await wait_for(lambda: host_views[-1]["phase"] == "podium")
        finally:
            await host.disconnect()
            await player.disconnect()

        reports: dict[str, Any] = {"items": []}
        for _ in range(50):
            reports = (await http.get("/api/reports")).json()
            if reports["items"]:
                break
            await asyncio.sleep(0.05)
        assert reports["items"][0]["playerCount"] == 1
        report = (await http.get(f"/api/reports/{reports['items'][0]['id']}")).json()
        assert report["players"][0]["nickname"] == "Grace"
        assert report["players"][0]["correctCount"] == 1
        csv_report = await http.get(f"/api/reports/{report['id']}/csv")
        assert "Grace" in csv_report.text


async def test_spa_fallback_serves_index_html(settings_factory: Callable[..., Any], tmp_path: Any) -> None:
    dist = tmp_path / "web"
    (dist / "assets").mkdir(parents=True)
    (dist / "index.html").write_text("<!doctype html><title>Pinpop</title>")
    (dist / "assets" / "app.js").write_text("console.log(1)")
    async with running(Pinpop(settings_factory(WEB_DIST=dist))) as c:
        page = await c.get("/quiz/abc/edit")
        assert page.status_code == 200
        assert "<title>Pinpop</title>" in page.text
        asset = await c.get("/assets/app.js")
        assert "immutable" in asset.headers["cache-control"]
        missing = await c.get("/api/nope")
        assert missing.status_code == 404
        assert missing.json()["code"] == "not_found"
        assert (await c.get("/../../etc/passwd")).text.startswith("<!doctype html>")
