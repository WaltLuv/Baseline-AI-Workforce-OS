# Baseline A2A Server — Hand-off SOP

This is the standard operating procedure for running, testing, and extending
the Baseline Workforce A2A server: the JSON-RPC 2.0 bridge that lets any
Agent2Agent-speaking peer hand tasks to the coding CLIs on this machine
(Claude Code, Oh My Pi).

## What it is

- **Protocol:** [A2A](https://a2a-protocol.org/latest/specification/) over
  JSON-RPC 2.0 + SSE, built on the official `a2a-sdk` (v1.x, pinned in
  `pyproject.toml`). The classic v0.3 method names (`message/send`,
  `message/stream`, `tasks/get`, `tasks/cancel`) are enabled alongside the
  v1 names (`SendMessage`, `SendStreamingMessage`, `GetTask`, `CancelTask`),
  so peers of either generation interoperate.
- **Discovery:** `GET /.well-known/agent-card.json`. The card is honest: a
  skill is listed only while its CLI binary is actually installed.
- **Skills:** `claude-code` (Claude Code CLI) and `oh-my-pi` (the `omp`
  coding harness — the lead-integrator role; note that Oh My Pi is the `omp`
  CLI, **not** the PI Agent memory persona).
- **Local-first:** binds `127.0.0.1` only. No telemetry, no outbound calls.

## Layout

```
apps/a2a-server/
  pyproject.toml            uv-managed; a2a-sdk pinned
  src/a2a_server/
    __main__.py             uvicorn entry (127.0.0.1:8484)
    app.py                  FastAPI assembly (importable by tests)
    config.py               state dir, port, binary discovery, skill bindings
    cards.py                the honest agent card
    executor.py             CliAgentExecutor: A2A task → subprocess lifecycle
    store.py                transaction ledger (the Workforce OS telemetry contract)
    bridge/
      claude.py             argv + stream-json parser for `claude -p`
      omp.py                argv + tolerant parser for `omp -p --mode json`
  tests/                    pytest suite (fake CLI shims; no real spend)
  docs/SOP.md               this file
  docs/SWARM.md             swarm-orchestration blueprint (design doc)
```

## State directory

`~/.baseline-workforce/a2a/` — **a deliberate deviation** from the original
blueprint's `~/.baseline/a2a`, so all of Workforce OS keeps a single writable
home. Set `BASELINE_A2A_HOME` to override (e.g. to the blueprint path).

```
~/.baseline-workforce/a2a/
  transactions/YYYY-MM.jsonl   one JSON line per finished task — Workforce OS
                               reads these files directly for its A2A page
  logs/
```

Transaction record fields (a contract — Workforce OS reads these names):
`taskId, contextId, skill, state, startedAt, endedAt, promptChars,
inputTokens, outputTokens, costUsd, error`.

## Run

```bash
cd apps/a2a-server
uv sync
uv run python -m a2a_server        # http://127.0.0.1:8484
```

Environment knobs: `A2A_PORT` (default 8484), `A2A_MAX_SECONDS` (default 600),
`A2A_CLAUDE_BIN` / `A2A_OMP_BIN` (binary overrides), `BASELINE_A2A_HOME`.

## Smoke test (curl)

```bash
curl -s http://127.0.0.1:8484/.well-known/agent-card.json | python3 -m json.tool

curl -s -X POST http://127.0.0.1:8484/ -H 'Content-Type: application/json' -d '{
  "jsonrpc":"2.0","id":1,"method":"message/send",
  "params":{"message":{"messageId":"m1","role":"user",
    "parts":[{"kind":"text","text":"Reply with exactly: A2A_READY"}]}}}'
```

Route to Oh My Pi by adding `"metadata": {"skill": "oh-my-pi"}` to the message.
Streaming: `message/stream` returns SSE task-status events.

## Test / TDD loop

```bash
uv run pytest            # full suite — runs against fake claude/omp shims
uv run pytest -k bridge  # pure parser tests
```

The TDD loop for a bridge change: add a failing case to `tests/test_bridges.py`
with a real line captured from the CLI → make the parser pass → run the full
suite. The lifecycle tests spin the whole FastAPI app in-process with shim
binaries, so they are fast, deterministic, and spend nothing.

## Extending

- **New skill/CLI:** add a `SkillBinding` in `config.py`, a bridge module in
  `bridge/`, and an entry in `bridge_for()`. The card, executor routing, and
  ledger pick it up automatically.
- **omp event shapes:** `bridge/omp.py` is deliberately tolerant because omp's
  `--mode json` format is not formally documented; unknown shapes pass through
  verbatim so output never silently disappears. Refine it with captured real
  lines + a test per shape.
