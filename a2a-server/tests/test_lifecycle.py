"""Full message/send lifecycle against the fake CLIs, plus tasks/get and the
failure path. Exercises both the classic v0.3 method names and the v1 names,
because peers may speak either."""

from __future__ import annotations

import json

import pytest

from tests.conftest import rpc

pytestmark = pytest.mark.anyio


@pytest.fixture
def anyio_backend():
    return "asyncio"


def _final_task(payload: dict) -> dict:
    """The result of a blocking send — tolerate both response shapes."""
    result = payload["result"]
    return result.get("task", result) if isinstance(result, dict) else result


async def test_v03_message_send_completes_with_artifact(client):
    body = rpc(
        "message/send",
        {
            "message": {
                "messageId": "m-1",
                "role": "user",
                "parts": [{"kind": "text", "text": "say hello"}],
            }
        },
    )
    r = await client.post("/", json=body)
    assert r.status_code == 200, r.text
    payload = r.json()
    assert "error" not in payload, payload
    task = _final_task(payload)
    state = task["status"]["state"]
    assert state in ("completed", "TASK_STATE_COMPLETED"), payload
    arts = task.get("artifacts") or []
    text = json.dumps(arts)
    assert "Hello from fake claude" in text


async def test_v03_tasks_get_roundtrip(client):
    send = rpc(
        "message/send",
        {
            "message": {
                "messageId": "m-2",
                "role": "user",
                "parts": [{"kind": "text", "text": "hello again"}],
            }
        },
    )
    task = _final_task((await client.post("/", json=send)).json())
    got = await client.post("/", json=rpc("tasks/get", {"id": task["id"]}, id_=2))
    payload = got.json()
    assert "error" not in payload, payload
    fetched = _final_task(payload)
    assert fetched["id"] == task["id"]


async def test_skill_routing_reaches_omp(client):
    body = rpc(
        "message/send",
        {
            "message": {
                "messageId": "m-3",
                "role": "user",
                "parts": [{"kind": "text", "text": "Reply with exactly: OMP_OK"}],
                "metadata": {"skill": "oh-my-pi"},
            }
        },
    )
    payload = (await client.post("/", json=body)).json()
    assert "error" not in payload, payload
    task = _final_task(payload)
    assert "OMP_OK" in json.dumps(task.get("artifacts") or [])


async def test_missing_binary_fails_with_install_hint(a2a_env, monkeypatch):
    monkeypatch.setenv("A2A_CLAUDE_BIN", str(a2a_env["tmp"] / "missing-claude"))
    import httpx

    from a2a_server.app import create_app

    app = create_app(base_url="http://testserver/")
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://testserver"
    ) as c:
        body = rpc(
            "message/send",
            {
                "message": {
                    "messageId": "m-4",
                    "role": "user",
                    "parts": [{"kind": "text", "text": "anything"}],
                }
            },
        )
        payload = (await c.post("/", json=body)).json()
    task = _final_task(payload)
    state = task["status"]["state"]
    assert state in ("failed", "TASK_STATE_FAILED"), payload
    # The failure message must carry the install hint — honest, actionable.
    assert "not installed" in json.dumps(payload)
