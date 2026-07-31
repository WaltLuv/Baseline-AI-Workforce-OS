"""The agent card is served and honest about which skills exist."""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.anyio


@pytest.fixture
def anyio_backend():
    return "asyncio"


async def test_card_served_with_both_skills(client):
    r = await client.get("/.well-known/agent-card.json")
    assert r.status_code == 200
    card = r.json()
    assert card["name"] == "Baseline Workforce A2A"
    ids = {s["id"] for s in card["skills"]}
    assert ids == {"claude-code", "oh-my-pi"}
    assert card["capabilities"]["streaming"] is True


async def test_card_omits_skill_when_binary_missing(a2a_env, monkeypatch):
    # Point the omp override at a path that does not exist → skill must vanish.
    monkeypatch.setenv("A2A_OMP_BIN", str(a2a_env["tmp"] / "nope"))
    import httpx

    from a2a_server.app import create_app

    app = create_app(base_url="http://testserver/")
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as c:
        card = (await c.get("/.well-known/agent-card.json")).json()
    ids = {s["id"] for s in card["skills"]}
    assert ids == {"claude-code"}
