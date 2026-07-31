"""Transaction records — the exact contract Workforce OS telemetry reads."""

from __future__ import annotations

import json

import pytest

from tests.conftest import rpc

pytestmark = pytest.mark.anyio


@pytest.fixture
def anyio_backend():
    return "asyncio"


async def test_completed_run_writes_transaction(client, a2a_env):
    body = rpc(
        "message/send",
        {
            "message": {
                "messageId": "m-tx",
                "role": "user",
                "parts": [{"kind": "text", "text": "say hello"}],
            }
        },
    )
    r = await client.post("/", json=body)
    assert r.status_code == 200

    tx_dir = a2a_env["home"] / "transactions"
    files = list(tx_dir.glob("*.jsonl"))
    assert files, "no transaction file written"
    lines = [json.loads(l) for l in files[0].read_text().splitlines()]
    done = [l for l in lines if l["state"] == "completed"]
    assert done, lines
    tx = done[-1]
    # Contract fields — Workforce OS reads exactly these names.
    for key in (
        "taskId",
        "contextId",
        "skill",
        "state",
        "startedAt",
        "endedAt",
        "promptChars",
        "inputTokens",
        "outputTokens",
        "costUsd",
        "error",
    ):
        assert key in tx, f"missing {key}"
    assert tx["skill"] == "claude-code"
    assert tx["inputTokens"] == 12
    assert tx["outputTokens"] == 34
    assert tx["costUsd"] == pytest.approx(0.005)
