"""Shared fixtures: fake CLI shims + an isolated A2A home per test."""

from __future__ import annotations

import os
import stat
import textwrap
from pathlib import Path

import pytest

FAKE_CLAUDE = textwrap.dedent(
    """\
    #!/bin/sh
    # Fake Claude Code: emits stream-json like the real `claude -p --output-format stream-json`.
    printf '%s\\n' '{"type":"assistant","message":{"content":[{"type":"text","text":"Hello from fake claude. "}]}}'
    printf '%s\\n' '{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Read","input":{"file_path":"/tmp/x"}}]}}'
    printf '%s\\n' '{"type":"assistant","message":{"content":[{"type":"text","text":"Done."}]}}'
    printf '%s\\n' '{"type":"result","result":"Hello from fake claude. Done.","usage":{"input_tokens":12,"output_tokens":34},"total_cost_usd":0.005}'
    """
)

FAKE_OMP = textwrap.dedent(
    """\
    #!/bin/sh
    printf '%s\\n' '{"type":"message","text":"OMP_OK"}'
    printf '%s\\n' '{"usage":{"input_tokens":3,"output_tokens":4}}'
    """
)

FAKE_FAILING = textwrap.dedent(
    """\
    #!/bin/sh
    echo "boom: credentials missing" >&2
    exit 3
    """
)


def _write_shim(dir_: Path, name: str, body: str) -> Path:
    p = dir_ / name
    p.write_text(body)
    p.chmod(p.stat().st_mode | stat.S_IEXEC)
    return p


@pytest.fixture()
def a2a_env(tmp_path, monkeypatch):
    """Isolated state dir + fake claude/omp binaries."""
    bins = tmp_path / "bin"
    bins.mkdir()
    _write_shim(bins, "claude", FAKE_CLAUDE)
    _write_shim(bins, "omp", FAKE_OMP)
    home = tmp_path / "a2a-home"
    monkeypatch.setenv("BASELINE_A2A_HOME", str(home))
    monkeypatch.setenv("A2A_CLAUDE_BIN", str(bins / "claude"))
    monkeypatch.setenv("A2A_OMP_BIN", str(bins / "omp"))
    monkeypatch.setenv("A2A_MAX_SECONDS", "30")
    return {"bins": bins, "home": home, "tmp": tmp_path}


@pytest.fixture()
def client(a2a_env):
    import httpx

    from a2a_server.app import create_app

    app = create_app(base_url="http://testserver/")
    transport = httpx.ASGITransport(app=app)
    return httpx.AsyncClient(transport=transport, base_url="http://testserver")


def make_failing_claude(a2a_env, monkeypatch):
    p = _write_shim(a2a_env["bins"], "claude-fail", FAKE_FAILING)
    monkeypatch.setenv("A2A_CLAUDE_BIN", str(p))


def rpc(method: str, params: dict, id_: int = 1) -> dict:
    return {"jsonrpc": "2.0", "id": id_, "method": method, "params": params}
